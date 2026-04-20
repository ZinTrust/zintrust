import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  registerDatabases: vi.fn(),
  registerMany: vi.fn(),
  shutdownIfInitialized: vi.fn(async () => undefined),
  resetDatabase: vi.fn(async () => undefined),
  closeLockProvider: vi.fn(async () => undefined),
  ensureNodeStartupEnvLoaded: vi.fn(async () => undefined),
  resolveNodeProjectRoot: vi.fn(async () => '/project'),
  spawnAndWait: vi.fn(async () => 0),
  useFileLoader: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock('@config/database', () => ({ databaseConfig: { default: {} } }));
vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: (...args: any[]) => mocked.spawnAndWait(...args),
  },
}));
vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: (...args: any[]) => mocked.registerDatabases(...args),
}));
vi.mock('@runtime/NodeStartup', () => ({
  ensureNodeStartupEnvLoaded: (...args: any[]) => mocked.ensureNodeStartupEnvLoaded(...args),
}));
vi.mock('@runtime/resolveNodeProjectRoot', () => ({
  resolveNodeProjectRoot: (...args: any[]) => mocked.resolveNodeProjectRoot(...args),
}));
vi.mock('@runtime/useFileLoader', () => ({
  useFileLoader: (...args: any[]) => mocked.useFileLoader(...args),
  default: (...args: any[]) => mocked.useFileLoader(...args),
}));
vi.mock('@node-singletons/fs', async () => {
  const actual = await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
  return {
    ...actual,
    existsSync: (...args: any[]) => mocked.existsSync(...args),
  };
});
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    registerMany: (...args: any[]) => mocked.registerMany(...args),
  },
}));

const createLoader = (args: {
  path: string;
  exists?: boolean;
  module?: Record<string, unknown>;
  error?: Error;
}) => ({
  candidates: () => [args.path],
  path: () => args.path,
  exists: () => args.exists === true,
  get: async () => {
    if (args.error !== undefined) throw args.error;
    if (Object.hasOwn(args.module ?? {}, 'default') && args.module?.default !== undefined) {
      return args.module.default;
    }
    return args.module ?? {};
  },
  getModule: async () => {
    if (args.error !== undefined) throw args.error;
    return args.module ?? {};
  },
});

describe('ScheduleCliSupport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocked.useFileLoader.mockImplementation((relativePath: string) => {
      if (relativePath === 'app/Schedules/index.ts') {
        return createLoader({ path: '/project/app/Schedules/index.ts' });
      }

      return createLoader({ path: '/project/app/Schedules.ts' });
    });
  });

  it('registerAll loads core and app schedules and registers both', async () => {
    vi.doMock('@schedules/index', () => ({
      a: { name: 'a', handler: async () => undefined },
      notSchedule: 1,
    }));
    vi.doMock('@app/Schedules', () => ({
      b: { name: 'b', handler: async () => undefined },
      bad: { nope: true },
    }));

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();

    expect(mocked.registerDatabases).toHaveBeenCalledTimes(1);
    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'core');
    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'app');
  });

  it('registerAll tolerates missing app schedules and shutdown is best-effort', async () => {
    vi.doMock('@schedules/index', () => ({ a: { name: 'a', handler: async () => undefined } }));
    vi.doMock('@app/Schedules', () => {
      throw new Error('missing');
    });
    vi.doMock('@orm/ConnectionManager', () => ({
      ConnectionManager: {
        shutdownIfInitialized: (...args: any[]) => mocked.shutdownIfInitialized(...args),
      },
    }));
    vi.doMock('@orm/Database', () => ({
      resetDatabase: (...args: any[]) => mocked.resetDatabase(...args),
    }));
    vi.doMock('@queue/LockProvider', () => ({
      closeLockProvider: (...args: any[]) => mocked.closeLockProvider(...args),
    }));

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();
    await ScheduleCliSupport.shutdownCliResources();

    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'core');
    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'app');
    expect(mocked.shutdownIfInitialized).toHaveBeenCalledTimes(1);
    expect(mocked.resetDatabase).toHaveBeenCalledTimes(1);
    expect(mocked.closeLockProvider).toHaveBeenCalledTimes(1);
  });

  it('registerAll falls back to a project-root schedule file when alias import is unavailable', async () => {
    vi.doMock('@schedules/index', () => ({ a: { name: 'a', handler: async () => undefined } }));
    vi.doMock('@app/Schedules', () => {
      throw new Error('alias-missing');
    });
    mocked.useFileLoader.mockImplementation((relativePath: string) => {
      if (relativePath === 'app/Schedules/index.ts') {
        return createLoader({
          path: '/project/app/Schedules/index.ts',
          exists: true,
          module: { b: { name: 'b', handler: async () => undefined } },
        });
      }

      return createLoader({ path: '/project/app/Schedules.ts' });
    });

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();

    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'app');
  });

  it('registerAll prefers project schedule files over alias imports when both exist', async () => {
    const fileSchedule = { name: 'fileSchedule', handler: async () => undefined };

    vi.doMock('@schedules/index', () => ({ a: { name: 'a', handler: async () => undefined } }));
    vi.doMock('@app/Schedules', () => ({
      aliasSchedule: { name: 'aliasSchedule', handler: async () => undefined },
    }));
    mocked.useFileLoader.mockImplementation((relativePath: string) => {
      if (relativePath === 'app/Schedules/index.ts') {
        return createLoader({
          path: '/project/app/Schedules/index.ts',
          exists: true,
          module: { fileSchedule },
        });
      }

      return createLoader({ path: '/project/app/Schedules.ts' });
    });

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();

    expect(mocked.registerMany).toHaveBeenCalledWith([fileSchedule], 'app');
  });

  it('registerAll keeps named schedules when the fallback file mixes default and named exports', async () => {
    const defaultSchedule = { name: 'defaultOnly', handler: async () => undefined };
    const namedSchedule = { name: 'namedAlso', handler: async () => undefined };

    vi.doMock('@schedules/index', () => ({}));
    vi.doMock('@app/Schedules', () => {
      throw new Error('alias-missing');
    });
    mocked.useFileLoader.mockImplementation((relativePath: string) => {
      if (relativePath === 'app/Schedules/index.ts') {
        return createLoader({
          path: '/project/app/Schedules/index.ts',
          exists: true,
          module: {
            default: defaultSchedule,
            namedSchedule,
          },
        });
      }

      return createLoader({ path: '/project/app/Schedules.ts' });
    });

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();

    expect(mocked.registerMany).toHaveBeenCalledWith(
      expect.arrayContaining([defaultSchedule, namedSchedule]),
      'app'
    );
  });

  it('registerAll flattens default schedule arrays without duplicating names', async () => {
    const arraySchedule = { name: 'arraySchedule', handler: async () => undefined };
    const namedSchedule = { name: 'namedSchedule', handler: async () => undefined };

    vi.doMock('@schedules/index', () => ({ default: [arraySchedule] }));
    vi.doMock('@app/Schedules', () => ({
      default: [arraySchedule, namedSchedule],
      namedSchedule,
    }));

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();

    expect(mocked.registerMany).toHaveBeenCalledWith([arraySchedule], 'core');
    expect(mocked.registerMany).toHaveBeenCalledWith([arraySchedule, namedSchedule], 'app');
  });

  it('re-enters through the project source CLI for source schedule files', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', '/global/bin/zintrust', 'schedule:list', '--json'];

    mocked.useFileLoader.mockImplementation((relativePath: string) => {
      if (relativePath === 'app/Schedules/index.ts') {
        return createLoader({ path: '/project/app/Schedules/index.ts', exists: true });
      }

      return createLoader({ path: '/project/app/Schedules.ts' });
    });
    mocked.existsSync.mockImplementation(
      (candidate: string) => candidate === '/project/bin/zin.ts'
    );

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await expect(ScheduleCliSupport.ensureProjectSourceContext()).resolves.toBe(true);

    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tsx',
        args: ['bin/zin.ts', 'schedule:list', '--json'],
        cwd: '/project',
      })
    );

    process.argv = originalArgv;
  });

  it('re-enters through the current packaged CLI when the project has no source bin entrypoint', async () => {
    const originalArgv = process.argv;
    process.argv = [
      'node',
      '/project/node_modules/@zintrust/core/bin/zin.js',
      'schedule:list',
      '--json',
    ];

    mocked.useFileLoader.mockImplementation((relativePath: string) => {
      if (relativePath === 'app/Schedules/index.ts') {
        return createLoader({ path: '/project/app/Schedules/index.ts', exists: true });
      }

      return createLoader({ path: '/project/app/Schedules.ts' });
    });
    mocked.existsSync.mockImplementation((candidate: string) => {
      return candidate === '/project/node_modules/@zintrust/core/bin/zin.js';
    });

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await expect(ScheduleCliSupport.ensureProjectSourceContext()).resolves.toBe(true);

    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tsx',
        args: ['node_modules/@zintrust/core/bin/zin.js', 'schedule:list', '--json'],
        cwd: '/project',
      })
    );

    process.argv = originalArgv;
  });
});
