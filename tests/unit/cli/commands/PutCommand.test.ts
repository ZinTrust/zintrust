import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PutCommand } from '@cli/commands/PutCommand';

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    handle: vi.fn(),
  },
}));

vi.mock('@toolkit/Secrets/EnvFile', () => ({
  EnvFile: {
    read: vi.fn(),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('@node-singletons/child-process', () => ({
  execFileSync: vi.fn(),
}));

import { ErrorHandler } from '@cli/ErrorHandler';
import { execFileSync } from '@node-singletons/child-process';
import { existsSync, readFileSync } from '@node-singletons/fs';
import { EnvFile } from '@toolkit/Secrets/EnvFile';

describe('PutCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ d1_env: ['APP_KEY', 'D1_REMOTE_SECRET'], kv_env: ['APP_KEY'] })
    );
  });

  it('creates command', () => {
    const cmd = PutCommand.create();
    expect(cmd.name).toBe('put');
    expect(cmd.getCommand().name()).toBe('put');
  });

  it('supports --wg target with dry-run and reports pushed count', async () => {
    vi.mocked(EnvFile.read).mockResolvedValue({
      APP_KEY: 'app-secret',
      D1_REMOTE_SECRET: 'remote-secret',
    });

    const cmd = PutCommand.create();
    await cmd.execute({
      args: ['cloudflare'],
      wg: ['d1-proxy'],
      var: ['d1_env'],
      env_path: '.env',
      dryRun: true,
    });

    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
    expect(vi.mocked(ErrorHandler.info)).toHaveBeenCalledWith('[dry-run] put APP_KEY -> d1-proxy');
    expect(vi.mocked(ErrorHandler.info)).toHaveBeenCalledWith(
      '[dry-run] put D1_REMOTE_SECRET -> d1-proxy'
    );
    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalledWith(
      'Cloudflare secrets report: pushed=2, failed=0'
    );
  });

  it('marks D1_REMOTE_SECRET as failed when missing from env source', async () => {
    vi.mocked(EnvFile.read).mockResolvedValue({
      APP_KEY: 'app-secret',
    });

    const cmd = PutCommand.create();
    await cmd.execute({
      args: ['cloudflare'],
      wg: ['d1-proxy'],
      var: ['d1_env'],
      env_path: '.env',
      dryRun: true,
    });

    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalledWith(
      'Cloudflare secrets report: pushed=1, failed=1'
    );
    expect(vi.mocked(ErrorHandler.warn)).toHaveBeenCalledWith(
      'D1_REMOTE_SECRET -> d1-proxy: empty value'
    );
  });

  it('throws usage error when no var group provided', async () => {
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-secret' });

    const cmd = PutCommand.create();
    await expect(
      cmd.execute({
        args: ['cloudflare'],
        wg: ['d1-proxy'],
        dryRun: true,
      })
    ).rejects.toBeDefined();
  });
});
