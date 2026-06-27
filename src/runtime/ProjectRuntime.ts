import { readEnvString } from '@common/ExternalServiceUtils';
import { Logger } from '@config/logger';
import {
  normalizeActiveServiceRuntime,
  normalizeProjectRuntimeModule,
  type ActiveServiceRuntime,
  type ProjectRuntimeModule,
  type ServiceManifestEntry,
} from '@microservices/ServiceManifest';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

type RuntimeGlobal = typeof globalThis & {
  __zintrustProjectRuntime?: ProjectRuntimeModule;
};

const getRuntimeGlobal = (): RuntimeGlobal => globalThis as RuntimeGlobal;

const getProjectRoot = (): string => {
  const fromEnv = readEnvString('ZINTRUST_PROJECT_ROOT');
  if (fromEnv.trim().length > 0) return fromEnv.trim();
  return process.cwd();
};

const getNodeRuntimeCandidates = (projectRoot: string): string[] => [
  path.join(projectRoot, 'src', 'zintrust.runtime.ts'),
  path.join(projectRoot, 'dist', 'src', 'zintrust.runtime.js'),
  path.join(projectRoot, 'src', 'zintrust.runtime.js'),
];

const WORKER_RUNTIME_CANDIDATES = [
  '@/zintrust.runtime.wg',
  '@/zintrust.runtime',
  '../zintrust.runtime.wg.js',
  '../zintrust.runtime.js',
] as const;

const mergeProjectRuntime = (
  current: ProjectRuntimeModule | undefined,
  next: ProjectRuntimeModule
): ProjectRuntimeModule => {
  return Object.freeze({
    ...(current?.serviceManifest === undefined ? {} : { serviceManifest: current.serviceManifest }),
    ...(current?.activeService === undefined ? {} : { activeService: current.activeService }),
    ...(next.serviceManifest === undefined ? {} : { serviceManifest: next.serviceManifest }),
    ...(next.activeService === undefined ? {} : { activeService: next.activeService }),
  });
};

const cacheProjectRuntime = (module: unknown): ProjectRuntimeModule => {
  const runtimeModule = normalizeProjectRuntimeModule(module);
  const merged = mergeProjectRuntime(getCachedProjectRuntime(), runtimeModule);
  getRuntimeGlobal().__zintrustProjectRuntime = merged;
  return merged;
};

const getCachedProjectRuntime = (): ProjectRuntimeModule | undefined => {
  return getRuntimeGlobal().__zintrustProjectRuntime;
};

const hasLoadedServiceManifest = (runtime: ProjectRuntimeModule | undefined): boolean => {
  return Array.isArray(runtime?.serviceManifest);
};

const tryImportNodeRuntimeCandidate = async (
  candidate: string
): Promise<ProjectRuntimeModule | undefined> => {
  if (!existsSync(candidate)) return undefined;

  try {
    const moduleUrl = pathToFileURL(candidate).href;
    const runtimeModule = (await import(moduleUrl)) as Record<string, unknown>;
    return cacheProjectRuntime(runtimeModule);
  } catch (error) {
    Logger.warn('Failed to import project runtime candidate', {
      candidate,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
};

const tryImportWorkerRuntimeLiteralCandidates = async (): Promise<
  ProjectRuntimeModule | undefined
> => {
  const attempts = await Promise.allSettled(
    WORKER_RUNTIME_CANDIDATES.map(async (candidate) => {
      // These files are generated in consuming projects and are legitimately absent
      // when a browser bundle only imports unrelated helpers such as Logger.
      return (await import(/* @vite-ignore */ candidate)) as Record<string, unknown>;
    })
  );

  for (const attempt of attempts) {
    if (attempt.status === 'fulfilled') {
      return cacheProjectRuntime(attempt.value);
    }
  }

  return undefined;
};

export const ProjectRuntime = Object.freeze({
  clear(): void {
    delete getRuntimeGlobal().__zintrustProjectRuntime;
  },

  getCached(): ProjectRuntimeModule | undefined {
    return getCachedProjectRuntime();
  },

  set(module: unknown): ProjectRuntimeModule {
    return cacheProjectRuntime(module);
  },

  setActiveService(activeService: unknown): ActiveServiceRuntime | undefined {
    const normalized = normalizeActiveServiceRuntime(activeService);
    if (normalized === undefined) return getCachedProjectRuntime()?.activeService;
    return cacheProjectRuntime({ activeService: normalized }).activeService;
  },

  async tryLoadNodeRuntime(): Promise<ProjectRuntimeModule | undefined> {
    const cached = getCachedProjectRuntime();
    if (hasLoadedServiceManifest(cached)) return cached;

    const projectRoot = getProjectRoot();
    const candidates = getNodeRuntimeCandidates(projectRoot);

    for (const candidate of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const loaded = await tryImportNodeRuntimeCandidate(candidate);
      if (loaded !== undefined) return loaded;
    }

    return undefined;
  },

  async tryLoadWorkerRuntime(): Promise<ProjectRuntimeModule | undefined> {
    const cached = getCachedProjectRuntime();
    if (hasLoadedServiceManifest(cached)) return cached;

    return tryImportWorkerRuntimeLiteralCandidates();
  },

  getServiceManifest(): ReadonlyArray<ServiceManifestEntry> {
    return getCachedProjectRuntime()?.serviceManifest ?? [];
  },

  getActiveService(): ActiveServiceRuntime | undefined {
    return getCachedProjectRuntime()?.activeService;
  },
});

export default ProjectRuntime;
