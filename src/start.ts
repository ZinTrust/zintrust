import { ErrorFactory } from '@exceptions/ZintrustError';
import { isArray, isNonEmptyString, isObject } from '@helper/index';
import { ZintrustLang } from '@lang/lang';
import {
  normalizeActiveServiceRuntime,
  type ActiveServiceRuntime,
} from '@microservices/ServiceManifest';
import { ProjectRuntime } from '@runtime/ProjectRuntime';

import { isNodeRuntime } from '@runtime/detectRuntime';

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
    throw ErrorFactory.createValidationError(
      'Standalone service runtime requires at least domain and name.'
    );
  }

  return ProjectRuntime.set({ activeService: normalized }).activeService ?? normalized;
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

const resolveStandaloneProjectRoot = async (): Promise<string> => {
  const configuredRoot = process.env?.['ZINTRUST_PROJECT_ROOT'] ?? '';
  if (isNonEmptyString(configuredRoot)) return configuredRoot;

  const { existsSync } = await import('@node-singletons/fs');
  const path = await import('@node-singletons/path');

  let current = process.cwd();
  while (true) {
    if (existsSync(path.join(current, 'package.json'))) return current;

    const parent = path.dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
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
  const projectRoot = await resolveStandaloneProjectRoot();
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

  // Compiled output places bootstrap at `dist/src/boot/bootstrap.js`.
  // This file compiles to `dist/src/start.js`, so relative import is stable.
  // In unit tests, importing bootstrap has heavy side effects (starts server + exits).
  await import('@boot/bootstrap');
};

/**
 * Cloudflare Workers entry (module worker style).
 */
export { default } from '@functions/cloudflare';

export { default as cloudflareWorker } from '@functions/cloudflare';

/**
 * Deno fetch handler.
 */
export { default as deno } from '@functions/deno';

/**
 * AWS Lambda handler.
 */
export { handler } from '@functions/lambda';
