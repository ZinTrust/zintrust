import Logger from '@config/logger';
import type { IRouter } from '@core-routes/Router';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import type { RoutesModule } from '@registry/type';

export const isCompiledJsModule = (): boolean => {
  // When running from dist, this module is compiled to .js and Node ESM resolution
  // requires explicit file extensions for relative imports.
  const metaUrl = typeof import.meta?.url === 'string' ? import.meta.url : '';
  return metaUrl.endsWith('.js');
};

export const tryImportOptional = async <T>(modulePath: string): Promise<T | undefined> => {
  try {
    return (await import(modulePath)) as T;
  } catch {
    return undefined;
  }
};

export const tryImportOptionalR = async <T>(modulePath: string): Promise<T | undefined> => {
  try {
    return (await import(modulePath)) as T;
  } catch (error: unknown) {
    Logger.error(`Error importing module ${modulePath}:`, error);
    return undefined;
  }
};

const tryImportRoutesFromAppBase = async (
  resolvedBasePath: string
): Promise<RoutesModule | undefined> => {
  if (resolvedBasePath === '') return undefined;

  const candidates = [
    // Dev (tsx)
    path.join(resolvedBasePath, 'routes', 'api.ts'),
    // Production build output
    path.join(resolvedBasePath, 'dist', 'routes', 'api.js'),
    // Fallback (in case someone transpiles without /dist)
    path.join(resolvedBasePath, 'routes', 'api.js'),
  ];

  for (const candidate of candidates) {
    try {
      const url = pathToFileURL(candidate).href;
      // eslint-disable-next-line no-await-in-loop
      return (await import(url)) as RoutesModule;
    } catch (error: unknown) {
      Logger.error('error :', error);
      // keep trying
    }
  }

  return undefined;
};

const registerAppRoutes = async (resolvedBasePath: string, router: IRouter): Promise<void> => {
  const mod = await tryImportRoutesFromAppBase(resolvedBasePath);
  if (mod && typeof mod.registerRoutes === 'function') {
    mod.registerRoutes(router);
  }
};

const registerFrameworkRoutes = async (router: IRouter): Promise<void> => {
  const frameworkRoutes = await tryImportOptionalR<{
    registerRoutes?: (router: IRouter) => void;
  }>('@routes/api');

  if (frameworkRoutes && typeof frameworkRoutes.registerRoutes === 'function') {
    frameworkRoutes.registerRoutes(router);
  }
};

const registerGlobalRoutes = (router: IRouter): void => {
  const globalRoutes = (
    globalThis as unknown as {
      __zintrustRoutes?: RoutesModule;
    }
  ).__zintrustRoutes;

  if (globalRoutes && typeof globalRoutes.registerRoutes === 'function') {
    globalRoutes.registerRoutes(router);
  } else {
    Logger.warn(
      'No app routes found and framework routes are unavailable. Ensure routes/api.ts exists in the project.'
    );
  }
};

export const registerMasterRoutes = async (
  resolvedBasePath: string,
  router: IRouter
): Promise<void> => {
  try {
    await registerAppRoutes(resolvedBasePath, router);
    if (router.routes.length === 0) {
      await registerFrameworkRoutes(router);
      if (router.routes.length === 0) {
        registerGlobalRoutes(router);
      }
    }

    // Always register core framework routes (health, metrics, doc) after app routes
    // This ensures app can override but core routes always exist
    const { registerCoreRoutes } = await import('@core-routes/CoreRoutes');
    registerCoreRoutes(router);
  } catch (error: unknown) {
    Logger.error('Failed to register routes:', error as Error);
  }
};
