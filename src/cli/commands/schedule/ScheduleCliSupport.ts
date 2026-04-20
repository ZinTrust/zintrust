import { SpawnUtil } from '@cli/utils/spawn';
import { databaseConfig } from '@config/database';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import path from '@node-singletons/path';
import { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';
import { ensureNodeStartupEnvLoaded } from '@runtime/NodeStartup';
import { resolveNodeProjectRoot } from '@runtime/resolveNodeProjectRoot';
import useFileLoader from '@runtime/useFileLoader';
import { SchedulerRuntime } from '@scheduler/SchedulerRuntime';
import type { ISchedule } from '@scheduler/types';

type LoadedScheduleModules = {
  core: ISchedule[];
  app: ISchedule[];
};

type LoadedScheduleModule = {
  module: Record<string, unknown>;
  loadedPath?: string;
};

type FileLoaderLike = ReturnType<typeof useFileLoader>;

const SOURCE_REENTRY_ENV = 'ZINTRUST_SCHEDULE_CLI_SOURCE_REENTRY';

const isSchedule = (value: unknown): value is ISchedule => {
  if (value === undefined || value === null || typeof value !== 'object') return false;
  return 'name' in value && typeof (value as { name?: unknown }).name === 'string';
};

const getDefaultExport = (moduleNamespace: Record<string, unknown>): unknown => {
  return Object.hasOwn(moduleNamespace, 'default') ? moduleNamespace['default'] : undefined;
};

const flattenScheduleCandidates = (moduleNamespace: Record<string, unknown>): unknown[] => {
  const candidates: unknown[] = [
    ...Object.values(moduleNamespace),
    getDefaultExport(moduleNamespace),
  ];
  return candidates.flatMap((value): unknown[] => (Array.isArray(value) ? value : [value]));
};

const collectSchedules = (moduleNamespace: Record<string, unknown>): ISchedule[] => {
  const flattenedCandidates = flattenScheduleCandidates(moduleNamespace);

  const seen = new Set<string>();

  return flattenedCandidates.filter(isSchedule).filter((schedule) => {
    const normalizedName = schedule.name.trim();
    if (normalizedName === '' || seen.has(normalizedName)) {
      return false;
    }

    seen.add(normalizedName);
    return true;
  });
};

const getProjectScheduleLoaders = (): FileLoaderLike[] => [
  useFileLoader('app/Schedules/index.ts'),
  useFileLoader('app/Schedules.ts'),
];

const isTypeScriptFile = (filePath: string): boolean => {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.ts' || ext === '.tsx' || ext === '.mts';
};

const getProjectSourceCliEntry = (projectRoot: string): string | undefined => {
  const candidates = [
    path.join(projectRoot, 'bin', 'zin.ts'),
    path.join(projectRoot, 'bin', 'zintrust.ts'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
};

const getCurrentCliScript = (): string | undefined => {
  const script = String(process.argv[1] ?? '').trim();
  if (script.length === 0) return undefined;

  const resolvedScript = path.resolve(script);
  return existsSync(resolvedScript) ? resolvedScript : undefined;
};

const isRunningProjectSourceCli = (projectRoot: string): boolean => {
  const resolvedScript = getCurrentCliScript();
  if (resolvedScript === undefined) return false;

  const sourceCliEntry = getProjectSourceCliEntry(projectRoot);
  if (sourceCliEntry === undefined) return false;

  return resolvedScript === path.resolve(sourceCliEntry);
};

const getScheduleReentryScript = (projectRoot: string): string | undefined => {
  const sourceCliEntry = getProjectSourceCliEntry(projectRoot);
  if (sourceCliEntry !== undefined) {
    return path.relative(projectRoot, sourceCliEntry);
  }

  const currentCliScript = getCurrentCliScript();
  if (currentCliScript === undefined) return undefined;

  const relativeCurrentScript = path.relative(projectRoot, currentCliScript);
  return relativeCurrentScript.startsWith('..') ? currentCliScript : relativeCurrentScript;
};

const getExistingProjectSchedulePath = (): string | undefined => {
  for (const loader of getProjectScheduleLoaders()) {
    if (loader.exists()) return loader.path();
  }

  return undefined;
};

const tryLoadProjectScheduleModuleFromFiles = async (): Promise<
  LoadedScheduleModule | undefined
> => {
  const existingLoaders = getProjectScheduleLoaders()
    .filter((loader) => loader.exists())
    .map((loader) => ({ loader, loadedPath: loader.path() }));

  const tryAt = async (
    index: number,
    firstError?: unknown
  ): Promise<LoadedScheduleModule | undefined> => {
    const entry = existingLoaders[index];
    if (entry === undefined) {
      if (existingLoaders.length > 0 && firstError !== undefined) throw firstError;
      return undefined;
    }

    try {
      return {
        module: await entry.loader.getModule<Record<string, unknown>>(),
        loadedPath: entry.loadedPath,
      };
    } catch (error) {
      return tryAt(index + 1, firstError ?? error);
    }
  };

  return tryAt(0);
};

const loadAppScheduleModule = async (): Promise<LoadedScheduleModule> => {
  const fileLoaded = await tryLoadProjectScheduleModuleFromFiles();
  if (fileLoaded !== undefined) {
    return fileLoaded;
  }

  try {
    return {
      module: (await import('@app/Schedules')) as unknown as Record<string, unknown>,
    };
  } catch {
    return fileLoaded ?? { module: {} };
  }
};

const loadScheduleModules = async (): Promise<LoadedScheduleModules> => {
  const coreSchedules = await import('@schedules/index');
  const appSchedules = await loadAppScheduleModule();

  return {
    core: collectSchedules(coreSchedules as Record<string, unknown>),
    app: collectSchedules(appSchedules.module),
  };
};

const ensureProjectSourceContext = async (): Promise<boolean> => {
  await ensureNodeStartupEnvLoaded({ entry: 'schedule-cli' });

  const projectRoot = await resolveNodeProjectRoot();
  if ((process.env['ZINTRUST_PROJECT_ROOT'] ?? '').trim() === '') {
    process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;
  }

  const existingSchedulePath = getExistingProjectSchedulePath();
  if (existingSchedulePath === undefined || !isTypeScriptFile(existingSchedulePath)) {
    return false;
  }

  if (String(process.env[SOURCE_REENTRY_ENV] ?? '') === '1') {
    return false;
  }

  if (isRunningProjectSourceCli(projectRoot)) {
    return false;
  }

  const reentryScript = getScheduleReentryScript(projectRoot);
  if (reentryScript === undefined) {
    throw ErrorFactory.createCliError(
      'Source schedules require either a project CLI entrypoint at bin/zin.ts or bin/zintrust.ts, or a resolvable current CLI script.'
    );
  }

  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'tsx',
    args: [reentryScript, ...process.argv.slice(2)],
    cwd: projectRoot,
    env: {
      ...process.env,
      ZINTRUST_PROJECT_ROOT: projectRoot,
      [SOURCE_REENTRY_ENV]: '1',
    },
  });

  if (exitCode !== 0) {
    throw ErrorFactory.createCliError(
      `Failed to execute schedule command via project source CLI (exit ${exitCode})`
    );
  }

  return true;
};

const shutdownCliResources = async (): Promise<void> => {
  try {
    const mod = await import('@orm/ConnectionManager');
    await mod.ConnectionManager.shutdownIfInitialized();
  } catch {
    // best-effort
  }

  try {
    const mod = await import('@orm/Database');
    await mod.resetDatabase();
  } catch {
    // best-effort
  }

  try {
    const mod = (await import('@queue/LockProvider')) as unknown as {
      closeLockProvider?: () => Promise<void>;
    };
    await mod.closeLockProvider?.();
  } catch {
    // best-effort
  }
};

export const ScheduleCliSupport = Object.freeze({
  ensureProjectSourceContext,
  async registerAll(): Promise<void> {
    await ensureNodeStartupEnvLoaded({ entry: 'schedule-cli' });
    registerDatabasesFromRuntimeConfig(databaseConfig);

    const modules = await loadScheduleModules();
    SchedulerRuntime.registerMany(modules.core, 'core');
    SchedulerRuntime.registerMany(modules.app, 'app');
  },

  shutdownCliResources,
});

export default ScheduleCliSupport;
