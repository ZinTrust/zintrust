type AnyFn = (...a: any[]) => any;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn((_path: string) => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((_path: string) => ''),
  writeFileSync: vi.fn(),
  spawnAndWait: vi.fn(async () => 0),
  ensureLoaded: vi.fn(),
  applyCliOverrides: vi.fn(),
  withWranglerDevVarsSnapshot: vi.fn(async (_args: unknown, callback: () => unknown) => callback()),
  resolveNpmPath: vi.fn(() => 'npm'),
  runFromSource: vi.fn(() => false),
  readEnvString: vi.fn((_key: string, fallback?: string) => fallback ?? ''),
  clear: vi.fn(),
  tryLoadNodeRuntime: vi.fn(async () => undefined),
  getServiceManifest: vi.fn(() => [] as unknown[]),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => (mocks.existsSync as AnyFn)(...args),
  mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
  readFileSync: (...args: unknown[]) => (mocks.readFileSync as AnyFn)(...args),
  writeFileSync: (...args: unknown[]) => mocks.writeFileSync(...args),
}));

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: (...args: unknown[]) => mocks.ensureLoaded(...args),
    applyCliOverrides: (...args: unknown[]) => mocks.applyCliOverrides(...args),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: (...args: unknown[]) => (mocks.spawnAndWait as AnyFn)(...args) },
}));

vi.mock('@cli/cloudflare/CloudflareWranglerDevEnv', () => ({
  withWranglerDevVarsSnapshot: (...args: unknown[]) => (mocks.withWranglerDevVarsSnapshot as AnyFn)(...args),
}));

vi.mock('@common/index', () => ({
  resolveNpmPath: (...args: unknown[]) => (mocks.resolveNpmPath as AnyFn)(...args),
  runFromSource: (...args: unknown[]) => (mocks.runFromSource as AnyFn)(...args),
}));

vi.mock('@common/ExternalServiceUtils', () => ({
  readEnvString: (...args: unknown[]) => (mocks.readEnvString as AnyFn)(...args),
}));

vi.mock('@runtime/ProjectRuntime', () => ({
  ProjectRuntime: {
    clear: (...args: unknown[]) => mocks.clear(...args),
    tryLoadNodeRuntime: (...args: unknown[]) => (mocks.tryLoadNodeRuntime as AnyFn)(...args),
    getServiceManifest: (...args: unknown[]) => (mocks.getServiceManifest as AnyFn)(...args),
  },
}));

vi.mock('@helper/index', () => ({
  isNonEmptyString: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
}));

vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

import { StartCommand } from '@cli/commands/StartCommand';

const PROJECT_ROOT = '/workspace';

const helpers = () =>
  (StartCommand as unknown as {
    _helpers: {
      isWranglerVarName: (value: string) => boolean;
      isWindowsDriveAbsolutePath: (value: string) => boolean;
      containsCommandToken: (value: string, token: string) => boolean;
    };
  })._helpers;

describe('StartCommand uncovered branches', () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  const defaultExists = (value: string): boolean =>
    value === `${PROJECT_ROOT}/package.json` || value.endsWith('bootstrap.ts');

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['ZINTRUST_PROJECT_ROOT'];
    delete process.env['APP_PORT'];
    delete process.env['PORT'];
    delete process.env['RUNTIME'];
    delete process.env['DB_CONNECTION'];
    process.argv = [...originalArgv];
    vi.spyOn(process, 'cwd').mockReturnValue(PROJECT_ROOT);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mocks.existsSync.mockImplementation((path: string) => defaultExists(String(path)));
    mocks.readFileSync.mockReturnValue(JSON.stringify({ name: 'my-app' }));
    mocks.mkdirSync.mockReturnValue(undefined);
    mocks.writeFileSync.mockReturnValue(undefined);
    mocks.spawnAndWait.mockResolvedValue(0);
    mocks.resolveNpmPath.mockReturnValue('npm');
    mocks.runFromSource.mockReturnValue(false);
    mocks.readEnvString.mockImplementation((_key: string, fallback?: string) => fallback ?? '');
    mocks.getServiceManifest.mockReturnValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('covers identifier and path helper edge cases', () => {
    const h = helpers();
    expect(h.isWranglerVarName('')).toBe(false);
    expect(h.isWranglerVarName('9APP')).toBe(false);
    expect(h.isWranglerVarName('APP-PORT')).toBe(false);
    expect(h.isWranglerVarName('APP_PORT')).toBe(true);
    expect(h.isWindowsDriveAbsolutePath('C:')).toBe(false);
    expect(h.isWindowsDriveAbsolutePath('C:/x')).toBe(true);
    expect(h.isWindowsDriveAbsolutePath('C:\\x')).toBe(true);
    expect(h.isWindowsDriveAbsolutePath('1:/x')).toBe(false);
    expect(h.containsCommandToken('npm run zin', 'zin')).toBe(true);
    expect(h.containsCommandToken('amazing', 'zin')).toBe(false);
  });

  it('uses PORT when APP_PORT is absent', async () => {
    process.env['PORT'] = '5123';
    await StartCommand.create().execute({});
    expect(mocks.applyCliOverrides).toHaveBeenCalledWith(expect.objectContaining({ port: 5123 }));
  });

  it('normalizes a service directory with an empty derived port key', async () => {
    const serviceCwd = `${PROJECT_ROOT}/src/services/app/---`;
    process.env['SERVICE_PORT'] = '4100';
    vi.mocked(process.cwd).mockReturnValue(serviceCwd);
    mocks.existsSync.mockImplementation((path: string) => {
      const value = String(path);
      return value === `${PROJECT_ROOT}/package.json` || value === `${serviceCwd}/src/index.ts`;
    });

    await StartCommand.create().execute({});
    expect(mocks.applyCliOverrides).toHaveBeenCalledWith(expect.objectContaining({ port: 4100 }));
  });

  it('rejects cloudflare-workers configured through RUNTIME', async () => {
    mocks.readEnvString.mockImplementation((key: string, fallback?: string) =>
      key === 'RUNTIME' ? 'CLOUDFLARE-WORKERS' : (fallback ?? '')
    );
    await expect(StartCommand.create().execute({})).rejects.toThrow(/zin start --wg/);
  });

  it('handles cache and root-env flag variants', async () => {
    process.argv.push('--cache');
    await StartCommand.create().execute({});
    expect(mocks.applyCliOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ cacheEnabled: true })
    );

    process.argv = [...originalArgv, '--no-cache'];
    await StartCommand.create().execute({});
    expect(mocks.applyCliOverrides).toHaveBeenLastCalledWith(
      expect.objectContaining({ cacheEnabled: false })
    );

    process.argv = [...originalArgv];
    await StartCommand.create().execute({ cache: true });
    expect(mocks.applyCliOverrides).toHaveBeenLastCalledWith(
      expect.objectContaining({ cacheEnabled: true })
    );

    process.argv = [...originalArgv, '--root-env'];
    await StartCommand.create().execute({});
    expect(mocks.ensureLoaded).toHaveBeenCalledWith(expect.objectContaining({ includeCwd: true }));

    process.argv = [...originalArgv, '--root-env', '--no-root-env'];
    await expect(StartCommand.create().execute({})).rejects.toThrow(
      /Cannot use both --root-env and --no-root-env/
    );

    process.argv = [...originalArgv, '--no-root-env'];
    await StartCommand.create().execute({});
    expect(mocks.ensureLoaded).toHaveBeenCalledWith(expect.objectContaining({ includeCwd: false }));
  });

  it('forwards an absolute env path to the env loader and wrangler snapshot', async () => {
    await StartCommand.create().execute({ envPath: '/absolute/env' });
    expect(mocks.ensureLoaded).toHaveBeenCalledWith(
      expect.objectContaining({ envPaths: ['/absolute/env'] })
    );

    mocks.existsSync.mockImplementation((path: string) =>
      String(path).endsWith('wrangler.toml') || defaultExists(String(path))
    );
    await StartCommand.create().execute({ wg: true, envPath: 'config/env' });
    expect(mocks.withWranglerDevVarsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ envPath: `${PROJECT_ROOT}/config/env` }),
      expect.any(Function)
    );
  });

  it('skips manifest env preloading when an explicit env path is supplied', async () => {
    mocks.getServiceManifest.mockReturnValue([
      { domain: 'app', name: 'gateway', monolithEnabled: true },
    ]);
    await StartCommand.create().execute({ envPath: 'config/env' });
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it.each(['yes', 'on'])(
    'keeps root env authoritative for RUN_AS_MONOLITH=%s',
    async (monolithValue) => {
      mocks.readEnvString.mockImplementation((key: string, fallback?: string) =>
        key === 'RUN_AS_MONOLITH' ? monolithValue : (fallback ?? '')
      );
      mocks.getServiceManifest.mockReturnValue([
        { domain: 'app', name: 'gateway', monolithEnabled: true },
      ]);

      await StartCommand.create().execute({});
      expect(mocks.ensureLoaded).toHaveBeenLastCalledWith(
        expect.objectContaining({
          envPaths: [`${PROJECT_ROOT}/src/services/app/gateway`],
          envPathsOverrideExisting: false,
        })
      );
    }
  );

  it('resolves manifest env directories from an explicit configRoot', async () => {
    mocks.getServiceManifest.mockReturnValue([
      { domain: 'app', name: 'gateway', configRoot: 'config/services/gateway/service.config.json' },
    ]);

    await StartCommand.create().execute({});
    expect(mocks.ensureLoaded).toHaveBeenLastCalledWith(
      expect.objectContaining({ envPaths: [`${PROJECT_ROOT}/config/services/gateway`] })
    );
  });

  it('reports a package.json that disappears between lookups', async () => {
    let packageJsonCalls = 0;
    mocks.existsSync.mockImplementation((path: string) => {
      if (String(path).endsWith('package.json')) {
        packageJsonCalls += 1;
        return packageJsonCalls <= 2;
      }
      return false;
    });

    await expect(StartCommand.create().execute({})).rejects.toThrow(/No ZinTrust app found/);
    expect(packageJsonCalls).toBe(3);
  });

  it('warns about MySQL proxy settings in wrangler mode', async () => {
    mocks.existsSync.mockImplementation((path: string) =>
      String(path).endsWith('wrangler.toml') || defaultExists(String(path))
    );
    mocks.readEnvString.mockImplementation((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        DB_CONNECTION: 'mysql',
        MYSQL_PROXY_URL: '',
        MYSQL_PROXY_HOST: '  ',
        MYSQL_PROXY_PORT: '',
      };
      return values[key] ?? fallback ?? '';
    });

    await StartCommand.create().execute({ wg: true });
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('zin proxy:mysql'));
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('http://127.0.0.1:8789'));

    mocks.warn.mockClear();
    mocks.readEnvString.mockImplementation((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        DB_CONNECTION: 'mysql',
        MYSQL_PROXY_URL: 'http://configured',
        MYSQL_PROXY_HOST: 'proxy.local',
        MYSQL_PROXY_PORT: '9999',
      };
      return values[key] ?? fallback ?? '';
    });
    await StartCommand.create().execute({ wg: true });
    expect(mocks.warn).not.toHaveBeenCalledWith(expect.stringContaining('zin proxy:mysql'));

    mocks.readEnvString.mockImplementation((_key: string, fallback?: string) => fallback ?? '');
    await StartCommand.create().execute({ wg: true });
    expect(mocks.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'wrangler' })
    );
  });

  it('skips the unsafe bootstrap warning when the entry file disappears', async () => {
    let indexChecks = 0;
    mocks.existsSync.mockImplementation((path: string) => {
      const value = String(path);
      if (value.endsWith('src/index.ts')) {
        indexChecks += 1;
        return indexChecks === 1;
      }
      return value.endsWith('wrangler.toml') || value === `${PROJECT_ROOT}/package.json`;
    });

    await StartCommand.create().execute({ wg: true });
    expect(mocks.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Unsafe Worker bootstrap detected')
    );
  });

  it('prefers source bootstrap in production when ZINTRUST_RUN_FROM_SOURCE is set', async () => {
    mocks.runFromSource.mockReturnValue(true);
    mocks.existsSync.mockImplementation((path: string) =>
      String(path).endsWith('bootstrap.js') ||
      String(path).endsWith('bootstrap.ts') ||
      String(path) === `${PROJECT_ROOT}/package.json`
    );

    await StartCommand.create().execute({ mode: 'production' });
    expect(mocks.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tsx',
        env: expect.objectContaining({ ZINTRUST_BOOTSTRAP_PREFERENCE: 'source' }),
      })
    );
  });

  it.each([
    [true, 'tsx', 'bin/zin.ts'],
    [false, 'node', 'dist/bin/zin.js'],
  ])('starts split mode with worker entry available=%s', async (hasWorkerSource, command, arg) => {
    mocks.existsSync.mockImplementation((path: string) => {
      const value = String(path);
      if (value === `${PROJECT_ROOT}/bin/zin.ts`) return hasWorkerSource;
      return defaultExists(value);
    });

    const promise = StartCommand.create().execute({ mode: 'split' });
    await expect(promise).resolves.toBeUndefined();
    expect(mocks.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command,
        args: [arg, 'worker:start-all'],
        cwd: PROJECT_ROOT,
      })
    );
  });

  it('rejects --env outside wrangler mode', async () => {
    await expect(StartCommand.create().execute({ env: 'staging' })).rejects.toThrow(
      /--env is only supported with --wrangler/
    );
  });
});
