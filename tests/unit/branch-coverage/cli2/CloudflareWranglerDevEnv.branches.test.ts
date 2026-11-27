/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn((_path: string) => false),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  read: vi.fn(),
  write: vi.fn(async () => undefined),
  readZintrustConfig: vi.fn(() => ({})),
  resolveCloudflareEnvKeys: vi.fn(() => ['APP_KEY', 'JWT_SECRET']),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => (mocks.existsSync as (...a: any[]) => any)(...args),
  renameSync: (...args: unknown[]) => mocks.renameSync(...args),
  unlinkSync: (...args: unknown[]) => mocks.unlinkSync(...args),
}));

vi.mock('@toolkit/Secrets/EnvFile', () => ({
  EnvFile: {
    read: (...args: unknown[]) => mocks.read(...args),
    write: (...args: unknown[]) => (mocks.write as (...a: any[]) => any)(...args),
  },
}));

vi.mock('@cli/cloudflare/CloudflareEnvTargetConfig', () => ({
  readZintrustConfig: (...args: unknown[]) => (mocks.readZintrustConfig as (...a: any[]) => any)(...args),
  resolveCloudflareEnvKeys: (...args: unknown[]) => (mocks.resolveCloudflareEnvKeys as (...a: any[]) => any)(...args),
}));

vi.mock('@helper/index', () => ({
  isNonEmptyString: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
}));

import {
  materializeWranglerDevVars,
  withWranglerDevVarsSnapshot,
  type WranglerDevEnvMaterializationResult,
} from '@cli/cloudflare/CloudflareWranglerDevEnv';

const baseArgs = {
  cwd: '/workspace',
  projectRoot: '/workspace',
};

const writtenValues = (): Record<string, string> =>
  (mocks.write.mock.calls.at(-1)?.[0] as { values: Record<string, string> })?.values ?? {};

describe('CloudflareWranglerDevEnv uncovered branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
    mocks.read.mockResolvedValue({ APP_KEY: 'from-env', JWT_SECRET: 'secret' });
    mocks.resolveCloudflareEnvKeys.mockReturnValue(['APP_KEY', 'JWT_SECRET']);
    mocks.readZintrustConfig.mockReturnValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses .dev.vars by default and a trimmed named file when envName is set', async () => {
    const first = await materializeWranglerDevVars({ ...baseArgs });
    expect(first.filePath).toBe('/workspace/.dev.vars');

    const second = await materializeWranglerDevVars({ ...baseArgs, envName: ' staging ' });
    expect(second.filePath).toBe('/workspace/.dev.vars.staging');
  });

  it('allows selection-less manifests and rejects them when selection is required', async () => {
    const allowed = await materializeWranglerDevVars({ ...baseArgs, requireSelection: false });
    expect(allowed.selectedKeys).toEqual([]);

    await expect(
      materializeWranglerDevVars({ ...baseArgs, requireSelection: true })
    ).rejects.toThrow(/No .zintrust.json found/);

    mocks.existsSync.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.resolveCloudflareEnvKeys.mockReturnValue([]);
    await expect(
      materializeWranglerDevVars({ ...baseArgs, requireSelection: true })
    ).rejects.toThrow(/No Wrangler dev env keys resolved/);
  });

  it('forwards optional config path, env name, and target only when non-empty', async () => {
    mocks.existsSync.mockImplementation((path: string) => path.endsWith('.zintrust.json'));

    await materializeWranglerDevVars({
      ...baseArgs,
      configPath: ' custom.json ',
      envName: ' preview ',
      target: ' worker ',
    });

    expect(mocks.resolveCloudflareEnvKeys).toHaveBeenCalledWith({
      config: {},
      projectRoot: '/workspace',
      cwd: '/workspace',
      configPath: 'custom.json',
      wranglerEnv: 'preview',
      target: 'worker',
    });

    mocks.resolveCloudflareEnvKeys.mockClear();
    await materializeWranglerDevVars({ ...baseArgs, configPath: '  ', envName: '', target: ' ' });
    expect(mocks.resolveCloudflareEnvKeys).toHaveBeenCalledWith({
      config: {},
      projectRoot: '/workspace',
      cwd: '/workspace',
    });
  });

  it('rejects an empty selected key before validating its characters', async () => {
    mocks.existsSync.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.resolveCloudflareEnvKeys.mockReturnValue(['']);

    const result = await materializeWranglerDevVars({
      ...baseArgs,
      requireSelection: true,
      runtimeEnv: {},
    });

    expect(result.selectedKeys).toEqual(['']);
    expect(result.values).toEqual({});
  });

  it('records selected keys with no value as missing and uses a custom env path', async () => {
    mocks.existsSync.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.read.mockResolvedValue({ APP_KEY: 'from-env' });

    const result: WranglerDevEnvMaterializationResult = await materializeWranglerDevVars({
      ...baseArgs,
      envPath: ' .env.local ',
      requireSelection: true,
    });

    expect(result.missingKeys).toEqual(['JWT_SECRET']);
    expect(mocks.read).toHaveBeenCalledWith({ cwd: '/workspace', path: '.env.local' });
  });

  it('filters invalid runtime keys and deduplicates normalized names', async () => {
    mocks.existsSync.mockReturnValue(false);
    mocks.read.mockResolvedValue({});

    const result = await materializeWranglerDevVars({
      ...baseArgs,
      runtimeEnv: {
        '': 'empty',
        '1INVALID': 'digit-first',
        'lower': 'lower-first',
        'A-B': 'dash',
        _PRIVATE: 'underscore-first',
        A1_B: 'valid',
        ' APP_KEY ': 'padded-first',
        APP_KEY: 'padded-second',
        'APP_KEY ': 'padded-third',
      },
    });

    expect(result.values).toEqual({
      _PRIVATE: 'underscore-first',
      A1_B: 'valid',
      APP_KEY: 'padded-second',
    });
  });

  it('skips materialization when USE_ENV is truthy in runtime env or env file', async () => {
    for (const truthy of ['yes', 'ON']) {
      mocks.read.mockResolvedValue({});
      const run = vi.fn(async () => 'done');

      await expect(
        withWranglerDevVarsSnapshot(
          { ...baseArgs, runtimeEnv: { USE_ENV: truthy } },
          run
        )
      ).resolves.toBe('done');
      expect(run).toHaveBeenCalledOnce();
      expect(mocks.write).not.toHaveBeenCalled();
    }

    mocks.read.mockResolvedValue({ USE_ENV: 'TRUE' });
    const run = vi.fn(async () => 'done');
    await expect(withWranglerDevVarsSnapshot({ ...baseArgs }, run)).resolves.toBe('done');
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('uses a custom env path when deciding whether to use the env file directly', async () => {
    mocks.read.mockResolvedValueOnce({ USE_ENV: 'yes' });
    const run = vi.fn(async () => 'ok');

    await expect(
      withWranglerDevVarsSnapshot({ ...baseArgs, envPath: ' .env.custom ' }, run)
    ).resolves.toBe('ok');
    expect(mocks.read).toHaveBeenCalledWith({ cwd: '/workspace', path: '.env.custom' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('reads existing dev vars from the disabled backup when only a backup exists', async () => {
    mocks.existsSync.mockImplementation((path: string) =>
      path.endsWith('.dev.vars.disabled-by-zin')
    );
    mocks.read.mockImplementation(async ({ path }: { path: string }) =>
      path === '.dev.vars.disabled-by-zin' ? { APP_KEY: 'from-backup' } : { APP_KEY: 'from-env' }
    );

    await materializeWranglerDevVars({ ...baseArgs });

    expect(mocks.read).toHaveBeenCalledWith({
      cwd: '/workspace',
      path: '.dev.vars.disabled-by-zin',
    });
    expect(writtenValues()['APP_KEY']).toBe('from-backup');
  });

  it('restores a snapshot without a pre-existing backup', async () => {
    mocks.existsSync.mockImplementation((path: string) =>
      path.endsWith('.zintrust.json') || path.endsWith('.dev.vars')
    );

    await withWranglerDevVarsSnapshot({ ...baseArgs }, async () => undefined);

    expect(mocks.renameSync).toHaveBeenCalledWith(
      '/workspace/.dev.vars',
      '/workspace/.dev.vars.disabled-by-zin'
    );
    expect(mocks.unlinkSync).toHaveBeenCalledWith('/workspace/.dev.vars');
    expect(mocks.renameSync).not.toHaveBeenCalledWith(
      '/workspace/.dev.vars.disabled-by-zin',
      '/workspace/.dev.vars'
    );
  });

  it('reconciles an orphaned backup before and after snapshot execution', async () => {
    mocks.existsSync.mockImplementation((path: string) =>
      path.endsWith('.zintrust.json') || path.endsWith('.dev.vars.disabled-by-zin')
    );

    await withWranglerDevVarsSnapshot({ ...baseArgs }, async () => undefined);

    expect(mocks.renameSync).toHaveBeenCalledWith(
      '/workspace/.dev.vars.disabled-by-zin',
      '/workspace/.dev.vars'
    );
    expect(mocks.renameSync).toHaveBeenLastCalledWith(
      '/workspace/.dev.vars.disabled-by-zin',
      '/workspace/.dev.vars'
    );
  });

  it('deletes a stale backup when both target and backup exist', async () => {
    mocks.existsSync.mockReturnValue(true);

    await withWranglerDevVarsSnapshot({ ...baseArgs }, async () => undefined);

    expect(mocks.unlinkSync).toHaveBeenCalledWith('/workspace/.dev.vars.disabled-by-zin');
  });
});
