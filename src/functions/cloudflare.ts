import { Logger } from '@config/logger';
import { clearMiddlewareConfigCache } from '@config/middleware';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';
import mergeOverrideValues from '@runtime/OverrideValueMerge';
import { ProjectRuntime } from '@runtime/ProjectRuntime';
import {
  StartupConfigFile,
  StartupConfigFileRegistry,
  type StartupConfigFileTypes,
} from '@runtime/StartupConfigFileRegistry';
import { WorkerAdapterImports } from '@runtime/WorkerAdapterImports';

import { getKernel } from '@runtime/getKernel';

const startupConfigModules: ReadonlyArray<{
  file: StartupConfigFileTypes;
  serviceModuleId: string;
}> = Object.freeze([
  {
    file: StartupConfigFile.Broadcast,
    serviceModuleId: '@service-runtime-config/' + 'broadcast.ts',
  },
  {
    file: StartupConfigFile.Cache,
    serviceModuleId: '@service-runtime-config/' + 'cache.ts',
  },
  {
    file: StartupConfigFile.Database,
    serviceModuleId: '@service-runtime-config/' + 'database.ts',
  },
  {
    file: StartupConfigFile.Mail,
    serviceModuleId: '@service-runtime-config/' + 'mail.ts',
  },
  {
    file: StartupConfigFile.Middleware,
    serviceModuleId: '@service-runtime-config/' + 'middleware.ts',
  },
  {
    file: StartupConfigFile.Notification,
    serviceModuleId: '@service-runtime-config/' + 'notification.ts',
  },
  {
    file: StartupConfigFile.Queue,
    serviceModuleId: '@service-runtime-config/' + 'queue.ts',
  },
  {
    file: StartupConfigFile.Storage,
    serviceModuleId: '@service-runtime-config/' + 'storage.ts',
  },
  {
    file: StartupConfigFile.Workers,
    serviceModuleId: '@service-runtime-config/' + 'workers.ts',
  },
]);

type RootStartupModule = { default?: unknown };

type RootStartupImporter = () => Promise<RootStartupModule>;

const importRootBroadcastModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'broadcast.ts').catch(() => ({}))) as RootStartupModule;
};

const importRootCacheModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'cache.ts').catch(() => ({}))) as RootStartupModule;
};

const importRootDatabaseModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'database.ts').catch(() => ({}))) as RootStartupModule;
};

const importRootMailModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'mail.ts').catch(() => ({}))) as RootStartupModule;
};

const importRootMiddlewareModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'middleware.ts').catch(
    () => ({})
  )) as RootStartupModule;
};

const importRootNotificationModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'notification.ts').catch(
    () => ({})
  )) as RootStartupModule;
};

const importRootQueueModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'queue.ts').catch(() => ({}))) as RootStartupModule;
};

const importRootStorageModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'storage.ts').catch(() => ({}))) as RootStartupModule;
};

const importRootWorkersModule: RootStartupImporter = async () => {
  return (await import('@runtime-config/' + 'workers.ts').catch(() => ({}))) as RootStartupModule;
};

const rootStartupImporters: Readonly<Record<StartupConfigFileTypes, RootStartupImporter>> =
  Object.freeze({
    [StartupConfigFile.Broadcast]: importRootBroadcastModule,
    [StartupConfigFile.Cache]: importRootCacheModule,
    [StartupConfigFile.Database]: importRootDatabaseModule,
    [StartupConfigFile.Mail]: importRootMailModule,
    [StartupConfigFile.Middleware]: importRootMiddlewareModule,
    [StartupConfigFile.Notification]: importRootNotificationModule,
    [StartupConfigFile.Queue]: importRootQueueModule,
    [StartupConfigFile.Storage]: importRootStorageModule,
    [StartupConfigFile.Workers]: importRootWorkersModule,
  });

const importOptionalDefault = async (importer: RootStartupImporter): Promise<unknown> => {
  try {
    const module = await importer();
    return module.default;
  } catch {
    return undefined;
  }
};

const importOptionalDefaultById = async (moduleId: string): Promise<unknown> => {
  try {
    const module = (await import(moduleId)) as { default?: unknown };
    return module.default;
  } catch {
    return undefined;
  }
};

const resolveStartupOverrideValue = async (entry: {
  file: StartupConfigFileTypes;
  serviceModuleId: string;
}): Promise<unknown> => {
  const rootOverride = await importOptionalDefault(rootStartupImporters[entry.file]);

  const serviceOverride =
    ProjectRuntime.getActiveService() === undefined
      ? undefined
      : await importOptionalDefaultById(entry.serviceModuleId);

  if (rootOverride === undefined) return serviceOverride;
  if (serviceOverride === undefined) return rootOverride;

  return mergeOverrideValues(rootOverride, serviceOverride);
};

const applyStartupConfigOverrides = async (): Promise<void> => {
  try {
    const globalAny = globalThis as {
      __zintrustStartupConfigOverrides?: Map<StartupConfigFileTypes, unknown>;
    };
    globalAny.__zintrustStartupConfigOverrides ??= new Map<StartupConfigFileTypes, unknown>();

    const resolvedEntries = await Promise.all(
      startupConfigModules.map(async (entry) => ({
        file: entry.file,
        value: await resolveStartupOverrideValue(entry),
      }))
    );

    for (const entry of resolvedEntries) {
      if (entry.value === undefined) {
        globalAny.__zintrustStartupConfigOverrides.delete(entry.file);
        continue;
      }

      globalAny.__zintrustStartupConfigOverrides.set(entry.file, entry.value);
    }

    StartupConfigFileRegistry.clear();
    clearMiddlewareConfigCache();
    await StartupConfigFileRegistry.preload(startupConfigModules.map((entry) => entry.file));
  } catch (error) {
    Logger.error('Error applying startup config overrides:', error);
    // Best-effort: log and swallow errors since this is an optional.
  }
};

const injectIoredisModule = async (): Promise<void> => {
  const globalAny = globalThis as { __zintrustIoredisModule?: unknown };
  if (globalAny.__zintrustIoredisModule !== undefined) return;

  try {
    const module = await import('ioredis');
    globalAny.__zintrustIoredisModule = module;
  } catch {
    // Best-effort: leave undefined so resolveIORedis can surface a config error.
  }
};

let startupConfigOverridesPromise: Promise<void> | undefined;

const WORKER_ENV_SNAPSHOT_KEY = 'ZINTRUST_WORKER_ENV_SNAPSHOT';

const resolveWorkersEnv = (env: unknown): Record<string, unknown> => {
  const bindings =
    typeof env === 'object' && env !== null ? { ...(env as Record<string, unknown>) } : {};
  const rawSnapshot = bindings[WORKER_ENV_SNAPSHOT_KEY];

  if (typeof rawSnapshot !== 'string' || rawSnapshot.trim() === '') {
    return bindings;
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as Record<string, unknown>;
    Reflect.deleteProperty(bindings, WORKER_ENV_SNAPSHOT_KEY);
    return {
      ...parsed,
      ...bindings,
    };
  } catch {
    return bindings;
  }
};

const ensureStartupConfigOverridesLoaded = async (): Promise<void> => {
  startupConfigOverridesPromise ??= applyStartupConfigOverrides();
  await startupConfigOverridesPromise;
};

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    try {
      const workersEnv = resolveWorkersEnv(_env);
      // Make bindings available to framework code in Workers
      (globalThis as unknown as { env?: unknown }).env = workersEnv;
      const AppRoutes = (await import('@routes/' + 'api.ts')) as unknown as Record<string, unknown>;

      if (AppRoutes !== undefined) {
        (globalThis as unknown as { __zintrustRoutes?: unknown }).__zintrustRoutes = AppRoutes;
      }

      await ProjectRuntime.tryLoadWorkerRuntime();
      await ensureStartupConfigOverridesLoaded();
      await WorkerAdapterImports.ready; // NOSONAR - Ensure adapter imports are ready before handling requests.
      await injectIoredisModule();

      const kernel = await getKernel();
      const adapter = CloudflareAdapter.create({
        handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
          await kernel.handle(req, res);
        },
      });

      const platformResponse = await adapter.handle(request);
      return adapter.formatResponse(platformResponse) as Response;
    } catch (error) {
      const err = error as Error;
      Logger.error('Cloudflare handler error:', err);
      if (typeof err?.stack === 'string' && err.stack.trim() !== '') {
        Logger.error('Cloudflare handler stack:', err.stack);
      }
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
