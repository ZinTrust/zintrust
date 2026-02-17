import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  afterEach(() => {
    delete process.env['APP_KEY'];
    delete process.env['ZT_PUT_TIMEOUT_MS'];
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

  it('throws when provider is not cloudflare', async () => {
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-secret' });

    const cmd = PutCommand.create();
    await expect(
      cmd.execute({
        args: ['aws'],
        wg: ['worker'],
        var: ['d1_env'],
        dryRun: true,
      })
    ).rejects.toBeDefined();
  });

  it('throws when .zintrust.json is invalid JSON', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce('{not-json');
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-secret' });

    const cmd = PutCommand.create();
    await expect(
      cmd.execute({
        args: ['cloudflare'],
        wg: ['worker'],
        var: ['d1_env'],
        dryRun: true,
      })
    ).rejects.toBeDefined();
  });

  it('defaults wrangler env to worker and falls back to process.env for missing values', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ group: ['APP_KEY'] }));
    vi.mocked(EnvFile.read).mockResolvedValue({});
    process.env['APP_KEY'] = 'from-process';

    const cmd = PutCommand.create();
    await cmd.execute({
      args: ['cloudflare'],
      var: ['group'],
      dryRun: true,
    });

    expect(vi.mocked(ErrorHandler.info)).toHaveBeenCalledWith('[dry-run] put APP_KEY -> worker');
    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalledWith(
      'Cloudflare secrets report: pushed=1, failed=0'
    );
  });

  it('uses default timeout when ZT_PUT_TIMEOUT_MS is invalid', async () => {
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-secret' });
    process.env['ZT_PUT_TIMEOUT_MS'] = 'nope';

    const cmd = PutCommand.create();
    await cmd.execute({
      args: ['cloudflare'],
      wg: ['worker'],
      var: ['kv_env'],
      dryRun: false,
    });

    const call = vi.mocked(execFileSync).mock.calls[0];
    const options = call?.[2] as { timeout?: number } | undefined;
    expect(options?.timeout).toBe(120000);
  });

  it('returns empty config when .zintrust.json is missing and warns for empty group', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-secret' });

    const cmd = PutCommand.create();
    await expect(
      cmd.execute({
        args: ['cloudflare'],
        wg: ['worker'],
        var: ['missing_group'],
        dryRun: true,
      })
    ).rejects.toBeDefined();

    expect(vi.mocked(ErrorHandler.warn)).toHaveBeenCalledWith(
      'Group `missing_group` is missing or empty in .zintrust.json'
    );
  });

  it('throws when selected groups resolve no secret keys', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ empty_group: [] }));
    vi.mocked(EnvFile.read).mockResolvedValue({});

    const cmd = PutCommand.create();
    await expect(
      cmd.execute({
        args: ['cloudflare'],
        wg: ['worker'],
        var: ['empty_group'],
        dryRun: true,
      })
    ).rejects.toBeDefined();
  });

  it('uses configured timeout when ZT_PUT_TIMEOUT_MS is valid', async () => {
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-secret' });
    process.env['ZT_PUT_TIMEOUT_MS'] = '1234';

    const cmd = PutCommand.create();
    await cmd.execute({
      args: ['cloudflare'],
      wg: ['worker'],
      var: ['kv_env'],
      dryRun: false,
    });

    const call = vi.mocked(execFileSync).mock.calls[0];
    const options = call?.[2] as { timeout?: number } | undefined;
    expect(options?.timeout).toBe(1234);
  });

  it('reports non-Error failures when wrangler secret put throws', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ group: ['APP_KEY'] }));
    vi.mocked(EnvFile.read).mockResolvedValue({ APP_KEY: 'app-secret' });
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw 'boom';
    });

    const cmd = PutCommand.create();
    await cmd.execute({
      args: ['cloudflare'],
      wg: ['worker'],
      var: ['group'],
      dryRun: false,
    });

    expect(vi.mocked(ErrorHandler.warn)).toHaveBeenCalledWith('APP_KEY -> worker: boom');
    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalledWith(
      'Cloudflare secrets report: pushed=0, failed=1'
    );
  });
});
