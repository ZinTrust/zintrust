import { Logger } from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';
import mergeOverrideValues from '@runtime/OverrideValueMerge';
import { ProjectRuntime } from '@runtime/ProjectRuntime';
import { StartupConfigFile, type StartupConfigFileTypes } from '@runtime/StartupConfigFileRegistry';
import { WorkerAdapterImports } from '@runtime/WorkerAdapterImports';

import { getKernel } from '@runtime/getKernel';

const startupConfigModules: ReadonlyArray<{
  file: StartupConfigFileTypes;
  rootModuleId: string;
  serviceModuleId: string;
}> = Object.freeze([
  {
    file: StartupConfigFile.Broadcast,
    rootModuleId: '@runtime-config/' + 'broadcast.ts',
    serviceModuleId: '@service-runtime-config/' + 'broadcast.ts',
  },
  {
    file: StartupConfigFile.Cache,
    rootModuleId: '@runtime-config/' + 'cache.ts',
    serviceModuleId: '@service-runtime-config/' + 'cache.ts',
  },
  {
    file: StartupConfigFile.Database,
    rootModuleId: '@runtime-config/' + 'database.ts',
    serviceModuleId: '@service-runtime-config/' + 'database.ts',
  },
  {
    file: StartupConfigFile.Mail,
    rootModuleId: '@runtime-config/' + 'mail.ts',
    serviceModuleId: '@service-runtime-config/' + 'mail.ts',
  },
  {
    file: StartupConfigFile.Middleware,
    rootModuleId: '@runtime-config/' + 'middleware.ts',
    serviceModuleId: '@service-runtime-config/' + 'middleware.ts',
  },
  {
    file: StartupConfigFile.Notification,
    rootModuleId: '@runtime-config/' + 'notification.ts',
    serviceModuleId: '@service-runtime-config/' + 'notification.ts',
  },
  {
    file: StartupConfigFile.Queue,
    rootModuleId: '@runtime-config/' + 'queue.ts',
    serviceModuleId: '@service-runtime-config/' + 'queue.ts',
  },
  {
    file: StartupConfigFile.Storage,
    rootModuleId: '@runtime-config/' + 'storage.ts',
    serviceModuleId: '@service-runtime-config/' + 'storage.ts',
  },
]);

const importOptionalDefault = async (moduleId: string): Promise<unknown> => {
  try {
    const module = (await import(moduleId)) as { default?: unknown };
    return module.default;
  } catch {
    return undefined;
  }
};

const resolveStartupOverrideValue = async (entry: {
  rootModuleId: string;
  serviceModuleId: string;
}): Promise<unknown> => {
  const rootOverride = await importOptionalDefault(entry.rootModuleId);

  const serviceOverride =
    ProjectRuntime.getActiveService() === undefined
      ? undefined
      : await importOptionalDefault(entry.serviceModuleId);

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

const ensureStartupConfigOverridesLoaded = async (): Promise<void> => {
  startupConfigOverridesPromise ??= applyStartupConfigOverrides();
  await startupConfigOverridesPromise;
};

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    try {
      // Make bindings available to framework code in Workers
      (globalThis as unknown as { env?: unknown }).env = _env;
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
