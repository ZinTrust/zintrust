/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
type AnyFn = (...a: any[]) => any;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  ensureNodeStartupEnvLoaded: vi.fn(async () => undefined),
  resolveNodeProjectRoot: vi.fn(async () => '/project'),
  spawnAndWait: vi.fn(async () => 0),
  registerDatabases: vi.fn(),
  registerMany: vi.fn(),
  exists: vi.fn((_candidate: string) => false),
  loaders: [] as Array<{ path: string; exists: boolean; module: Record<string, unknown>; error?: Error }>,
  createCliError: vi.fn((message: string) => new Error(message)),
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: (...args: unknown[]) => (mocked.spawnAndWait as AnyFn)(...args) },
}));
vi.mock('@config/database', () => ({ databaseConfig: { default: {} } }));
vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: (...args: unknown[]) => mocked.registerDatabases(...args),
}));
vi.mock('@runtime/NodeStartup', () => ({
  ensureNodeStartupEnvLoaded: (...args: unknown[]) => (mocked.ensureNodeStartupEnvLoaded as AnyFn)(...args),
}));
vi.mock('@runtime/resolveNodeProjectRoot', () => ({
  resolveNodeProjectRoot: (...args: unknown[]) => (mocked.resolveNodeProjectRoot as AnyFn)(...args),
}));
vi.mock('@runtime/useFileLoader', () => ({
  default: (relativePath: string) => {
    const index = relativePath === 'app/Schedules/index.ts' ? 0 : 1;
    const entry = mocked.loaders[index] ?? { path: `/project/${relativePath}`, exists: false, module: {} };
    return {
      path: () => entry.path,
      exists: () => entry.exists,
      getModule: async () => {
        if (entry.error) throw entry.error;
        return entry.module;
      },
    };
  },
  useFileLoader: (relativePath: string) => {
    const index = relativePath === 'app/Schedules/index.ts' ? 0 : 1;
    const entry = mocked.loaders[index] ?? { path: `/project/${relativePath}`, exists: false, module: {} };
    return {
      path: () => entry.path,
      exists: () => entry.exists,
      getModule: async () => {
        if (entry.error) throw entry.error;
        return entry.module;
      },
    };
  },
}));
vi.mock('@node-singletons/fs', async () => {
  const actual = await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
  return { ...actual, existsSync: (...args: unknown[]) => (mocked.exists as AnyFn)(...args) };
});
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: { registerMany: (...args: unknown[]) => mocked.registerMany(...args) },
}));
vi.mock('@exceptions/ZintrustError', () => ({
  ErrorFactory: { createCliError: (message: string) => mocked.createCliError(message) },
}));

type Support = typeof import('@cli/commands/schedule/ScheduleCliSupport').ScheduleCliSupport;

describe('ScheduleCliSupport uncovered branches', () => {
  let support: Support;
  let originalArgv: string[];

  const setLoaders = (entries: typeof mocked.loaders) => {
    mocked.loaders = entries;
  };

  const setArgv = (argv: string[] | undefined) => {
    Object.defineProperty(process, 'argv', {
      configurable: true,
      writable: true,
      value: argv ?? [],
    });
  };

  const loadSupport = async () => {
    vi.resetModules();
    ({ ScheduleCliSupport: support } = await import('@cli/commands/schedule/ScheduleCliSupport'));
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    originalArgv = process.argv;
    setArgv(['node', '/other/cli.js']);
    mocked.exists.mockImplementation((candidate: string) => candidate === '/project/package.json');
    mocked.spawnAndWait.mockResolvedValue(0);
    setLoaders([]);
    await loadSupport();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(process, 'argv', { configurable: true, writable: true, value: originalArgv });
    vi.clearAllMocks();
  });

  it('returns false when no project schedule file exists', async () => {
    await expect(support.ensureProjectSourceContext()).resolves.toBe(false);
    expect(mocked.spawnAndWait).not.toHaveBeenCalled();
  });

  it('rejects existing schedule files that are not TypeScript', async () => {
    setLoaders([
      { path: '/project/app/Schedules/index.ts.md', exists: true, module: {} },
      { path: '/project/app/Schedules.ts', exists: false, module: {} },
    ]);

    await expect(support.ensureProjectSourceContext()).resolves.toBe(false);
  });

  it('accepts tsx and mts schedule files but skips reentrant invocations', async () => {
    for (const extension of ['.tsx', '.mts']) {
      setLoaders([
        { path: `/project/app/Schedules/index${extension}`, exists: true, module: {} },
        { path: '/project/app/Schedules.ts', exists: false, module: {} },
      ]);
      vi.stubEnv('ZINTRUST_SCHEDULE_CLI_SOURCE_REENTRY', '1');

      await expect(support.ensureProjectSourceContext()).resolves.toBe(false);
      expect(mocked.spawnAndWait).not.toHaveBeenCalled();
    }
  });

  it('skips reentry when already running the project source CLI', async () => {
    setLoaders([
      { path: '/project/app/Schedules/index.ts', exists: true, module: {} },
      { path: '/project/app/Schedules.ts', exists: false, module: {} },
    ]);
    mocked.exists.mockImplementation((candidate: string) =>
      ['/project/package.json', '/project/bin/zin.ts'].includes(candidate)
    );
    setArgv(['node', '/project/bin/zin.ts']);

    await expect(support.ensureProjectSourceContext()).resolves.toBe(false);
    expect(mocked.spawnAndWait).not.toHaveBeenCalled();
  });

  it('reenters through a project source CLI entry and reports a failed exit', async () => {
    setLoaders([
      { path: '/project/app/Schedules/index.ts', exists: true, module: {} },
      { path: '/project/app/Schedules.ts', exists: false, module: {} },
    ]);
    mocked.exists.mockImplementation((candidate: string) =>
      ['/project/package.json', '/project/bin/zintrust.ts'].includes(candidate)
    );
    setArgv(['node', '/other/cli.js', 'list']);

    await expect(support.ensureProjectSourceContext()).resolves.toBe(true);
    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tsx',
        args: ['bin/zintrust.ts', 'list'],
        cwd: '/project',
      })
    );

    mocked.spawnAndWait.mockResolvedValue(3);
    await expect(support.ensureProjectSourceContext()).rejects.toThrow(/exit 3/);
  });

  it('reenters through the current CLI script with relative and absolute paths', async () => {
    setLoaders([
      { path: '/project/app/Schedules/index.ts', exists: true, module: {} },
      { path: '/project/app/Schedules.ts', exists: false, module: {} },
    ]);

    mocked.exists.mockImplementation((candidate: string) =>
      ['/project/package.json', '/project/scripts/cli.js'].includes(candidate)
    );
    setArgv(['node', '/project/scripts/cli.js', 'run']);
    await expect(support.ensureProjectSourceContext()).resolves.toBe(true);
    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['scripts/cli.js', 'run'] })
    );

    mocked.exists.mockImplementation((candidate: string) =>
      ['/project/package.json', '/elsewhere/cli.js'].includes(candidate)
    );
    setArgv(['node', '/elsewhere/cli.js', 'run']);
    await expect(support.ensureProjectSourceContext()).resolves.toBe(true);
    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['/elsewhere/cli.js', 'run'] })
    );
  });

  it('throws when neither a project entry nor a resolvable current CLI script exists', async () => {
    setLoaders([
      { path: '/project/app/Schedules/index.ts', exists: true, module: {} },
      { path: '/project/app/Schedules.ts', exists: false, module: {} },
    ]);

    for (const argv of [undefined, ['node', ''], ['node']]) {
      setArgv(argv);
      await expect(support.ensureProjectSourceContext()).rejects.toThrow(
        /bin\/zin\.ts or bin\/zintrust\.ts/
      );
    }
  });

  it('preserves the first loader error and throws it after all loaders fail', async () => {
    vi.doMock('@schedules/index', () => ({}));
    vi.doMock('@app/Schedules', () => ({}));
    await loadSupport();

    const firstError = new Error('first loader failed');
    setLoaders([
      { path: '/project/app/Schedules/index.ts', exists: true, module: {}, error: firstError },
      { path: '/project/app/Schedules.ts', exists: true, module: {} },
    ]);

    await support.registerAll();
    expect(mocked.registerMany).toHaveBeenCalledWith([], 'app');

    setLoaders([
      { path: '/project/app/Schedules/index.ts', exists: true, module: {}, error: firstError },
      { path: '/project/app/Schedules.ts', exists: true, module: {}, error: new Error('second') },
    ]);
    await expect(support.registerAll()).rejects.toBe(firstError);
  });
});
