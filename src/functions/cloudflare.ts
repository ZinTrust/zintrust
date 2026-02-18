import { Logger } from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';
import { StartupConfigFile } from '@runtime/StartupConfigFileRegistry';
import { WorkerAdapterImports } from '@runtime/WorkerAdapterImports';

import { getKernel } from '@runtime/getKernel';

const applyStartupConfigOverrides = async (): Promise<void> => {
  try {
    const globalAny = globalThis as {
      __zintrustStartupConfigOverrides?: Map<string, unknown>;
    };
    globalAny.__zintrustStartupConfigOverrides ??= new Map<string, unknown>();

    const broadcastOverrides = (await import('@runtime-config/' + 'broadcast.ts')) as {
      default?: unknown;
    };
    const cacheOverrides = (await import('@runtime-config/' + 'cache.ts')) as { default?: unknown };
    const databaseOverrides = (await import('@runtime-config/' + 'database.ts')) as {
      default?: unknown;
    };
    const mailOverrides = (await import('@runtime-config/' + 'mail.ts')) as { default?: unknown };
    const middlewareOverrides = (await import('@runtime-config/' + 'middleware.ts')) as {
      default?: unknown;
    };
    const notificationOverrides = (await import('@runtime-config/' + 'notification.ts')) as {
      default?: unknown;
    };
    const queueOverrides = (await import('@runtime-config/' + 'queue.ts')) as { default?: unknown };
    const storageOverrides = (await import('@runtime-config/' + 'storage.ts')) as {
      default?: unknown;
    };

    globalAny.__zintrustStartupConfigOverrides.set(
      StartupConfigFile.Broadcast,
      broadcastOverrides.default
    );
    globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Cache, cacheOverrides.default);
    globalAny.__zintrustStartupConfigOverrides.set(
      StartupConfigFile.Database,
      databaseOverrides.default
    );
    globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Mail, mailOverrides.default);
    globalAny.__zintrustStartupConfigOverrides.set(
      StartupConfigFile.Middleware,
      middlewareOverrides.default
    );
    globalAny.__zintrustStartupConfigOverrides.set(
      StartupConfigFile.Notification,
      notificationOverrides.default
    );
    globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Queue, queueOverrides.default);
    globalAny.__zintrustStartupConfigOverrides.set(
      StartupConfigFile.Storage,
      storageOverrides.default
    );
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
