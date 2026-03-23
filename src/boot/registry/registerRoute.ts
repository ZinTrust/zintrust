import { appConfig } from '@/config';
import Logger from '@config/logger';
import { Router, type IRouter } from '@core-routes/Router';
import { isObject } from '@helper/index';
import { getServicePrefix } from '@microservices/ServiceManifest';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import type { RoutesModule } from '@registry/type';
import { detectRuntime } from '@runtime/detectRuntime';
import { ProjectRuntime } from '@runtime/ProjectRuntime';

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
      // eslint-disable-next-line no-await-in-loop
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

const registerManifestRoutes = async (router: IRouter): Promise<void> => {
  await ProjectRuntime.tryLoadNodeRuntime();

  const serviceManifest = ProjectRuntime.getServiceManifest();
  if (serviceManifest.length === 0) return;

  for (const entry of serviceManifest) {
    if (entry.monolithEnabled === false || typeof entry.loadRoutes !== 'function') {
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await entry.loadRoutes();
      const registerRoutes = isObject(mod) ? mod.registerRoutes : undefined;
      if (typeof registerRoutes === 'function') {
        Router.group(router, getServicePrefix(entry), (scopedRouter) => {
          registerRoutes(scopedRouter);
        });
      }
    } catch (error) {
      Logger.warn(`Failed to register manifest routes for ${entry.id}`, error as Error);
    }
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
    await registerManifestRoutes(router);
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
