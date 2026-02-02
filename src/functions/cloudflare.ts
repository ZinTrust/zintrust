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

applyStartupConfigOverrides();

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    try {
      // Make bindings available to framework code in Workers
      (globalThis as unknown as { env?: unknown }).env = _env;
      (globalThis as unknown as { __zintrustRoutes?: unknown }).__zintrustRoutes = AppRoutes;

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

export { WorkerShutdownDurableObject } from '@zintrust/workers';
