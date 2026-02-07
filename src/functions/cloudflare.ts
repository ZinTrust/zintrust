import { Logger } from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import * as AppRoutes from '@routes/api';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';
import { StartupConfigFile } from '@runtime/StartupConfigFileRegistry';

import broadcastOverrides from '@runtime-config/broadcast';
import cacheOverrides from '@runtime-config/cache';
import databaseOverrides from '@runtime-config/database';
import mailOverrides from '@runtime-config/mail';
import middlewareOverrides from '@runtime-config/middleware';
import notificationOverrides from '@runtime-config/notification';
import queueOverrides from '@runtime-config/queue';
import storageOverrides from '@runtime-config/storage';
import workersOverrides from '@runtime-config/workers';

import { getKernel } from '@runtime/getKernel';

import '@runtime/WorkerAdapterImports';

let workersAutoStartPromise: Promise<void> | null = null;

const ensureWorkersAutoStart = async (): Promise<void> => {
  if (workersAutoStartPromise !== null) return workersAutoStartPromise;

  workersAutoStartPromise = (async () => {
    try {
      const workers = await import('@zintrust/workers');
      if (workers?.WorkerInit?.initialize) {
        await workers.WorkerInit.initialize({
          enableResourceMonitoring: false,
          enableHealthMonitoring: false,
          enableAutoScaling: false,
          registerShutdownHandlers: false,
        });
      }

      if (workers?.WorkerInit?.autoStartPersistedWorkers) {
        await workers.WorkerInit.autoStartPersistedWorkers();
      }
    } catch (error) {
      Logger.warn('Worker auto-start skipped in Workers runtime', error as Error);
    }
  })();

  return workersAutoStartPromise;
};

const applyStartupConfigOverrides = (): void => {
  const globalAny = globalThis as {
    __zintrustStartupConfigOverrides?: Map<string, unknown>;
  };
  globalAny.__zintrustStartupConfigOverrides ??= new Map<string, unknown>();
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Broadcast, broadcastOverrides);
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Cache, cacheOverrides);
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Database, databaseOverrides);
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Mail, mailOverrides);
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Middleware, middlewareOverrides);
  globalAny.__zintrustStartupConfigOverrides.set(
    StartupConfigFile.Notification,
    notificationOverrides
  );
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Queue, queueOverrides);
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Storage, storageOverrides);
  globalAny.__zintrustStartupConfigOverrides.set(StartupConfigFile.Workers, workersOverrides);
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

applyStartupConfigOverrides();

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    try {
      // Make bindings available to framework code in Workers
      (globalThis as unknown as { env?: unknown }).env = _env;
      (globalThis as unknown as { __zintrustRoutes?: unknown }).__zintrustRoutes = AppRoutes;

      await injectIoredisModule();

      const kernel = await getKernel();

      await ensureWorkersAutoStart();

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

export { ZinTrustMySqlPoolDurableObject } from '@runtime/durable-objects/MySqlPoolDO';
export { PoolDurableObject } from '@runtime/durable-objects/PoolDurableObject';
export { ZinTrustPostgresPoolDurableObject } from '@runtime/durable-objects/PostgresPoolDO';
export { ZinTrustRedisPoolDurableObject } from '@runtime/durable-objects/RedisPoolDO';
export { ZinTrustWorkerShutdownDurableObject } from '@zintrust/workers';
