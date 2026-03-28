import { appConfig } from '@/config';
import Logger from '@config/logger';
import { Router, type IRouter } from '@core-routes/Router';
import { isNonEmptyString, isObject } from '@helper/index';
import {
  type ActiveServiceRuntime,
  type ServiceManifestEntry,
} from '@microservices/ServiceManifest';
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

const getProjectRoot = (): string => {
  const fromEnv = process.env?.['ZINTRUST_PROJECT_ROOT'] ?? '';
  if (fromEnv.trim() !== '') return fromEnv.trim();
  return process.cwd();
};

const resolveManifestServiceEnvDir = (projectRoot: string, entry: ServiceManifestEntry): string => {
  const configRoot = (entry as { configRoot?: unknown }).configRoot;
  if (isNonEmptyString(configRoot)) {
    return path.dirname(path.join(projectRoot, configRoot));
  }

  return path.join(projectRoot, 'src', 'services', entry.domain, entry.name);
};

const resolveServicePrefix = (entry: ServiceManifestEntry): string => {
  const prefix = (entry as { prefix?: unknown }).prefix;

  if (isNonEmptyString(prefix)) {
    const segments = prefix
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment !== '');

    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
  }

  return `/${entry.domain}/${entry.name}`;
};

const ensureManifestServiceEnvLoaded = async (entry: ServiceManifestEntry): Promise<void> => {
  if (isCloudflare) return;
  if (entry.loadEnv === false) return;

  const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
  const projectRoot = getProjectRoot();
  const envPath = resolveManifestServiceEnvDir(projectRoot, entry);

  EnvFileLoader.ensureLoaded({
    cwd: projectRoot,
    includeCwd: true,
    envPaths: [envPath],
  });
};

const shouldRegisterManifestEntry = (
  entry: ServiceManifestEntry,
  activeService: ActiveServiceRuntime | undefined
): boolean => {
  if (entry.monolithEnabled === false || typeof entry.loadRoutes !== 'function') {
    return false;
  }

  if (activeService !== undefined && activeService.id !== entry.id) {
    return false;
  }

  return true;
};

const loadRuntimeManifest = async (): Promise<void> => {
  if (isCloudflare) {
    await ProjectRuntime.tryLoadWorkerRuntime();
    return;
  }

  await ProjectRuntime.tryLoadNodeRuntime();
};

const registerManifestEntryRoutes = async (
  router: IRouter,
  entry: ServiceManifestEntry,
  activeService: ActiveServiceRuntime | undefined
): Promise<void> => {
  try {
    await ensureManifestServiceEnvLoaded(entry);
    const mod = await entry.loadRoutes?.();
    const registerRoutes = isObject(mod) ? mod.registerRoutes : undefined;
    if (typeof registerRoutes === 'function') {
      registerLoadedRoutes(router, entry, registerRoutes, activeService);
    }
  } catch (error) {
    Logger.warn(`Failed to register manifest routes for ${entry.id}`, error as Error);
  }
};

const registerLoadedRoutes = (
  router: IRouter,
  entry: ServiceManifestEntry,
  registerRoutes: (router: IRouter) => void,
  activeService: ActiveServiceRuntime | undefined
): void => {
  const servicePrefix = resolveServicePrefix(entry);

  if (activeService?.id === entry.id) {
    registerRoutes(router);
    return;
  }

  Router.group(router, servicePrefix, (scopedRouter) => {
    registerRoutes(scopedRouter);
  });
};

const registerManifestRoutes = async (router: IRouter): Promise<void> => {
  await loadRuntimeManifest();

  const serviceManifest = ProjectRuntime.getServiceManifest();
  if (serviceManifest.length === 0) return;

  const activeService = ProjectRuntime.getActiveService();
  if (activeService !== undefined && isCloudflare) return;

  for (const entry of serviceManifest) {
    if (!shouldRegisterManifestEntry(entry, activeService)) continue;

    // eslint-disable-next-line no-await-in-loop
    await registerManifestEntryRoutes(router, entry, activeService);
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
    const activeService = ProjectRuntime.getActiveService();
    if (isCloudflare) {
      registerGlobalRoutes(router);
    }
    if (!isCloudflare && activeService === undefined) {
      await registerAppRoutes(resolvedBasePath, router);
    }
    await registerManifestRoutes(router);
    if (router.routes.length === 0 && activeService === undefined) {
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
