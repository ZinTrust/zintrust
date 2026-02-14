import { Logger } from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import * as AppRoutes from '@routes/api';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';
import { StartupConfigFile } from '@runtime/StartupConfigFileRegistry';

import { getKernel } from '@runtime/getKernel';

import '@runtime/WorkerAdapterImports';

const importOptionalDefault = async (modulePath: string): Promise<unknown | undefined> => {
  try {
    const module = (await import(modulePath)) as { default?: unknown };
    return module.default;
  } catch {
    return undefined;
  }
};

const applyStartupConfigOverrides = async (): Promise<void> => {
  const globalAny = globalThis as {
    __zintrustStartupConfigOverrides?: Map<string, unknown>;
  };
  globalAny.__zintrustStartupConfigOverrides ??= new Map<string, unknown>();

  const loadTargets: Array<[string, string]> = [
    [StartupConfigFile.Broadcast, '@runtime-config/broadcast'],
    [StartupConfigFile.Cache, '@runtime-config/cache'],
    [StartupConfigFile.Database, '@runtime-config/database'],
    [StartupConfigFile.Mail, '@runtime-config/mail'],
    [StartupConfigFile.Middleware, '@runtime-config/middleware'],
    [StartupConfigFile.Notification, '@runtime-config/notification'],
    [StartupConfigFile.Queue, '@runtime-config/queue'],
    [StartupConfigFile.Storage, '@runtime-config/storage'],
  ];

  const loaded = await Promise.all(
    loadTargets.map(async ([configFile, modulePath]) => {
      const value = await importOptionalDefault(modulePath);
      return [configFile, value] as const;
    })
  );

  for (const [configFile, value] of loaded) {
    if (value !== undefined) {
      globalAny.__zintrustStartupConfigOverrides.set(configFile, value);
    }
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
      (globalThis as unknown as { __zintrustRoutes?: unknown }).__zintrustRoutes = AppRoutes;

      await ensureStartupConfigOverridesLoaded();
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
