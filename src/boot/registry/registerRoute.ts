import { appConfig } from '@/config';
import Logger from '@config/logger';
import type { IRouter } from '@core-routes/Router';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import type { RoutesModule } from '@registry/type';
import { detectRuntime } from '@runtime/detectRuntime';

const isCloudflare = detectRuntime().isCloudflare;

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

  const routeCandidates = appConfig.isDevelopment()
    ? [
        path.join(resolvedBasePath, 'routes', 'api.ts'),
        path.join(resolvedBasePath, 'routes', 'api.js'),
      ]
    : [
        path.join(resolvedBasePath, 'routes', 'api.js'),
        path.join(resolvedBasePath, 'dist', 'routes', 'api.js'),
        path.join(resolvedBasePath, 'routes', 'api.ts'),
        path.join(resolvedBasePath, 'dist', 'routes', 'api.ts'),
      ];

  for (const routePath of routeCandidates) {
    try {
      const url = pathToFileURL(routePath).href;
      return (await import(url)) as RoutesModule;
    } catch {
      // try next candidate
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

const registerFrameworkRoutes = async (
  resolvedBasePath: string,
  router: IRouter
): Promise<void> => {
  const frameworkRoutes = await tryImportRoutesFromAppBase(resolvedBasePath);

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
    if (isCloudflare) {
      registerGlobalRoutes(router);
    }
    if (!isCloudflare) {
      await registerAppRoutes(resolvedBasePath, router);
    }
    if (router.routes.length === 0) {
      await registerFrameworkRoutes(resolvedBasePath, router);
    }

    // Always register core framework routes (health, metrics, doc) after app routes
    // This ensures app can override but core routes always exist
    const { registerCoreRoutes } = await import('@core-routes/CoreRoutes');
    registerCoreRoutes(router);
  } catch (error: unknown) {
    Logger.error('Failed to register routes:', error as Error);
  }
};
