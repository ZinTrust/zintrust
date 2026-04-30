import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveCloudflareEnvKeys } from '@cli/cloudflare/CloudflareEnvTargetConfig';
import {
  materializeWranglerDevVars,
  withWranglerDevVarsSnapshot,
} from '@cli/cloudflare/CloudflareWranglerDevEnv';
import { existsSync, renameSync, unlinkSync } from '@node-singletons/fs';
import { EnvFile } from '@toolkit/Secrets/EnvFile';

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('@toolkit/Secrets/EnvFile', () => ({
  EnvFile: {
    read: vi.fn(),
    write: vi.fn(),
  },
}));

vi.mock('@cli/cloudflare/CloudflareEnvTargetConfig', () => ({
  readZintrustConfig: vi.fn(() => ({})),
  resolveCloudflareEnvKeys: vi.fn(() => ['APP_KEY', 'JWT_SECRET']),
}));

describe('CloudflareWranglerDevEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-key', JWT_SECRET: 'jwt-secret' });
    vi.mocked(EnvFile.write).mockResolvedValue(undefined);
  });

  it('materializes Wrangler dev vars from the manifest selection', async () => {
    const result = await materializeWranglerDevVars({
      cwd: '/workspace',
      projectRoot: '/workspace',
      envName: 'development',
      requireSelection: true,
      runtimeEnv: {
        PORT: '7777',
        WORKER_ENABLED: 'false',
      },
    });

    expect(EnvFile.write).toHaveBeenCalledWith({
      cwd: '/workspace',
      path: '.dev.vars.development',
      values: {
        APP_KEY: 'app-key',
        JWT_SECRET: 'jwt-secret',
        PORT: '7777',
        WORKER_ENABLED: 'false',
      },
      mode: 'overwrite',
    });
    expect(result.selectedKeys).toEqual(['APP_KEY', 'JWT_SECRET']);
    expect(result.missingKeys).toEqual([]);
  });

  it('restores an existing Wrangler dev vars file after snapshot execution', async () => {
    vi.mocked(existsSync).mockImplementation((filePath: string) => {
      return (
        filePath.endsWith('.zintrust.json') ||
        filePath.endsWith('.dev.vars') ||
        filePath.endsWith('.dev.vars.disabled-by-zin')
      );
    });

    await withWranglerDevVarsSnapshot(
      {
        cwd: '/workspace',
        projectRoot: '/workspace',
        requireSelection: true,
      },
      async () => undefined
    );

    expect(renameSync).toHaveBeenCalledWith(
      '/workspace/.dev.vars',
      '/workspace/.dev.vars.disabled-by-zin'
    );
    expect(unlinkSync).toHaveBeenCalledWith('/workspace/.dev.vars');
    expect(renameSync).toHaveBeenLastCalledWith(
      '/workspace/.dev.vars.disabled-by-zin',
      '/workspace/.dev.vars'
    );
  });

  it('preserves existing Wrangler dev var overrides during snapshot materialization', async () => {
    vi.mocked(existsSync).mockImplementation((filePath: string) => {
      return filePath.endsWith('.zintrust.json') || filePath.endsWith('.dev.vars.disabled-by-zin');
    });

    vi.mocked(EnvFile.read).mockImplementation(async ({ path }) => {
      if (path === '.dev.vars.disabled-by-zin') {
        return {
          APP_KEY: 'worker-app-key',
          DB_CONNECTION: 'd1',
        };
      }

      return {
        APP_KEY: 'env-app-key',
        DB_CONNECTION: 'sqlite',
        JWT_SECRET: 'jwt-secret',
      };
    });

    await withWranglerDevVarsSnapshot(
      {
        cwd: '/workspace',
        projectRoot: '/workspace',
        requireSelection: true,
      },
      async () => undefined
    );

    expect(EnvFile.write).toHaveBeenCalledWith({
      cwd: '/workspace',
      path: '.dev.vars',
      values: {
        APP_KEY: 'worker-app-key',
        JWT_SECRET: 'jwt-secret',
        DB_CONNECTION: 'd1',
        NODE_ENV: 'test',
      },
      mode: 'overwrite',
    });
  });

  it('skips Wrangler dev vars materialization when USE_ENV=true', async () => {
    vi.mocked(EnvFile.read).mockResolvedValueOnce({ USE_ENV: 'true' });
    const run = vi.fn(async () => 'ok');

    const result = await withWranglerDevVarsSnapshot(
      {
        cwd: '/workspace',
        projectRoot: '/workspace',
        requireSelection: true,
      },
      run
    );

    expect(result).toBe('ok');
    expect(run).toHaveBeenCalledOnce();
    expect(renameSync).not.toHaveBeenCalled();
    expect(unlinkSync).not.toHaveBeenCalled();
    expect(EnvFile.write).not.toHaveBeenCalled();
  });

  it('skips mixed-case runtime keys that Wrangler rejects in fallback mode', async () => {
    vi.mocked(resolveCloudflareEnvKeys).mockReturnValueOnce([]);
    vi.mocked(existsSync).mockImplementation((filePath: string) => {
      return filePath.endsWith('.zintrust.json');
    });
    vi.mocked(EnvFile.read).mockResolvedValueOnce({ APP_KEY: 'app-key' });

    await materializeWranglerDevVars({
      cwd: '/workspace',
      projectRoot: '/workspace',
      requireSelection: false,
      runtimeEnv: {
        APP_PORT: '7777',
        OSLogRateLimit: '64',
        WORKER_ENABLED: 'false',
      },
    });

    expect(EnvFile.write).toHaveBeenCalledWith({
      cwd: '/workspace',
      path: '.dev.vars',
      values: {
        APP_KEY: 'app-key',
        APP_PORT: '7777',
        WORKER_ENABLED: 'false',
      },
      mode: 'overwrite',
    });
  });
});
