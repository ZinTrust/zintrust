import { isArray, isNonEmptyString, isObject } from '@helper/index';
import { ZintrustLang } from '@lang/lang';
import {
  normalizeActiveServiceRuntime,
  type ActiveServiceRuntime,
} from '@microservices/ServiceManifest';
import { ensureNodeStartupEnvLoaded } from '@runtime/NodeStartup';
import { resolveNodeProjectRoot } from '@runtime/resolveNodeProjectRoot';

import { isNodeRuntime } from '@runtime/detectRuntime';

type ProjectRuntimeCache = {
  serviceManifest?: unknown;
  activeService?: ActiveServiceRuntime;
};

type ProjectRuntimeGlobal = typeof globalThis & {
  __zintrustProjectRuntime?: ProjectRuntimeCache;
};

type CloudflareDefaultExport = {
  fetch?: (request: Request, env: unknown, ctx: unknown) => Promise<Response>;
};

type CloudflareWorkerModule = CloudflareDefaultExport & {
  default?: CloudflareDefaultExport;
};

const getProjectRuntimeGlobal = (): ProjectRuntimeGlobal => globalThis as ProjectRuntimeGlobal;

const getCachedProjectRuntime = (): ProjectRuntimeCache | undefined => {
  return getProjectRuntimeGlobal().__zintrustProjectRuntime;
};

const setCachedProjectRuntime = (value: ProjectRuntimeCache): ProjectRuntimeCache => {
  const current = getCachedProjectRuntime();
  const next = Object.freeze({
    ...(current?.serviceManifest === undefined ? {} : { serviceManifest: current.serviceManifest }),
    ...(current?.activeService === undefined ? {} : { activeService: current.activeService }),
    ...(value.serviceManifest === undefined ? {} : { serviceManifest: value.serviceManifest }),
    ...(value.activeService === undefined ? {} : { activeService: value.activeService }),
  });

  getProjectRuntimeGlobal().__zintrustProjectRuntime = next;
  return next;
};

const createValidationError = (message: string): Error & { statusCode: number; code: string } => {
  // eslint-disable-next-line no-restricted-syntax
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.name = 'ValidationError';
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
};

const loadCloudflareWorker = async (): Promise<CloudflareDefaultExport> => {
  const module = (await import('@functions/cloudflare')) as CloudflareWorkerModule;
  if (typeof module.fetch === 'function') {
    return module;
  }

  if (module.default !== undefined && typeof module.default.fetch === 'function') {
    return module.default;
  }

  return module;
};

type StandaloneServiceEnvOptions = {
  rootEnv?: boolean;
  envPath?: string | ReadonlyArray<string>;
};

const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);

const fileUrlToPathLike = (value: string): string => {
  if (!value.startsWith(ZintrustLang.FILE_PROTOCOL)) return value;
  // Basic file URL decoding (sufficient for macOS/Linux paths).
  try {
    return decodeURIComponent(value.slice(ZintrustLang.FILE_PROTOCOL.length));
  } catch {
    return value.slice(ZintrustLang.FILE_PROTOCOL.length);
  }
};

export const isNodeMain = (importMetaUrl: string): boolean => {
  if (!isNodeRuntime()) return false;

  const argv1 = (process as unknown as { argv?: unknown }).argv;
  const scriptPath = Array.isArray(argv1) ? String(argv1[1] ?? '') : '';
  if (scriptPath === '') return false;

  const here = fileUrlToPathLike(importMetaUrl);
  if (scriptPath === here) return true;

  // Best-effort: handle relative argv paths and runner wrappers.
  return scriptPath.endsWith(here);
};

export const configureStandaloneService = (activeService: unknown): ActiveServiceRuntime => {
  const normalized = normalizeActiveServiceRuntime(activeService);
  if (normalized === undefined) {
    throw createValidationError('Standalone service runtime requires at least domain and name.');
  }

  return setCachedProjectRuntime({ activeService: normalized }).activeService ?? normalized;
};

const normalizeStandaloneEnvPaths = (value: unknown): string[] => {
  if (isNonEmptyString(value)) {
    const trimmed = value.trim();
    return trimmed === '' ? [] : [trimmed];
  }

  if (!isArray(value)) return [];
  return value
    .filter(isNonEmptyString)
    .map((item) => item.trim())
    .filter((item) => item !== '');
};

const resolveServiceEnvPath = async (
  importMetaUrl: string,
  activeService: unknown,
  projectRoot: string
): Promise<string> => {
  const path = await import('@node-singletons/path');

  if (isObject(activeService) && isNonEmptyString(activeService['configRoot'])) {
    return path.dirname(path.join(projectRoot, activeService['configRoot']));
  }

  const entryFile = fileUrlToPathLike(importMetaUrl);
  const entryDir = path.dirname(entryFile);
  return path.basename(entryDir) === 'src' ? path.dirname(entryDir) : entryDir;
};

const resolveConfiguredEnvPaths = async (
  projectRoot: string,
  activeService: unknown,
  importMetaUrl: string
): Promise<string[]> => {
  const path = await import('@node-singletons/path');
  const configured = isObject(activeService)
    ? normalizeStandaloneEnvPaths(activeService['envPath'])
    : [];

  if (configured.length > 0) {
    return configured.map((value) =>
      isAbsolutePath(value) ? value : path.join(projectRoot, value)
    );
  }

  return [await resolveServiceEnvPath(importMetaUrl, activeService, projectRoot)];
};

const ensureStandaloneServiceEnv = async (
  importMetaUrl: string,
  activeService: unknown
): Promise<void> => {
  if (!isNodeRuntime()) return;

  const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
  const projectRoot = await resolveNodeProjectRoot();
  const envPaths = await resolveConfiguredEnvPaths(projectRoot, activeService, importMetaUrl);
  const rootEnv = !isObject(activeService) || activeService['rootEnv'] !== false;

  EnvFileLoader.ensureLoaded({
    cwd: projectRoot,
    includeCwd: rootEnv,
    envPaths,
  });
};

export const bootStandaloneService = async (
  importMetaUrl: string,
  activeService: unknown
): Promise<ActiveServiceRuntime> => {
  await ensureStandaloneServiceEnv(importMetaUrl, activeService as StandaloneServiceEnvOptions);
  const configuredService = configureStandaloneService(activeService);

  if (isNodeMain(importMetaUrl)) {
    await start();
  }

  return configuredService;
};

/**
 * Start the Node server (dev/prod) by delegating to the framework bootstrap.
 *
 * This uses a non-literal dynamic import so Worker bundlers don't pull Node-only modules.
 */
export const start = async (): Promise<void> => {
  if (!isNodeRuntime()) return;

  await ensureNodeStartupEnvLoaded({
    entry: '@zintrust/core/start',
  });

  const projectBootstrapModule = (await import('@runtime/ProjectBootstrap')) as {
    loadProjectBootstrap: () => Promise<void>;
  };
  await projectBootstrapModule.loadProjectBootstrap();
};

const cloudflareFetch = async (request: Request, env: unknown, ctx: unknown): Promise<Response> => {
  const worker = await loadCloudflareWorker();

  if (typeof worker.fetch === 'function') {
    return worker.fetch(request, env, ctx);
  }

  throw createValidationError(
    'Cloudflare worker entry must export a fetch(request, env, ctx) handler.'
  );
};

const cloudflareWorker = Object.freeze({
  fetch: cloudflareFetch,
});

const deno = async (request: Request): Promise<Response> => {
  const module = (await import('@functions/deno')) as {
    default: (request: Request) => Promise<Response>;
  };
  return module.default(request);
};

const handler = async (event: unknown, context: unknown): Promise<unknown> => {
  const module = (await import('@functions/lambda')) as {
    handler: (event: unknown, context: unknown) => Promise<unknown>;
  };
  return module.handler(event, context);
};

/**
 * Cloudflare Workers entry (module worker style).
 */
export default cloudflareWorker;

export { cloudflareWorker };

/**
 * Deno fetch handler.
 */
export { deno };

/**
 * AWS Lambda handler.
 */
export { handler };

export { ZintrustSocketHub } from '@zintrust/socket';
