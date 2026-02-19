import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Wrangler --config options (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('DeployCommand --config', () => {
    it('throws when --config file does not exist', async () => {
      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => false) }));

      const { DeployCommand } = await import('@cli/commands/DeployCommand');
      await expect(
        DeployCommand.create().execute({
          args: ['worker'],
          env: 'staging',
          config: 'missing.jsonc',
        } as any)
      ).rejects.toThrow(/Wrangler config not found: missing\.jsonc/);
    });

    it('passes --config through to wrangler deploy when file exists', async () => {
      const spawnAndWait = vi.fn(async () => 0);
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));
      vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn((p: string) => p === '/cwd/wrangler.containers-proxy.jsonc'),
      }));

      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      const { DeployCommand } = await import('@cli/commands/DeployCommand');
      await DeployCommand.create().execute({
        args: ['worker'],
        env: 'staging',
        config: 'wrangler.containers-proxy.jsonc',
      } as any);

      expect(spawnAndWait).toHaveBeenCalledWith({
        command: 'wrangler',
        args: ['deploy', '--config', 'wrangler.containers-proxy.jsonc', '--env', 'staging'],
      });
    });
  });

  describe('PutCommand --config', () => {
    it('throws when --config path does not exist', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn((p: string) => p === '/cwd/.zintrust.json'),
        readFileSync: vi.fn(() => JSON.stringify({ proxy_env: ['APP_KEY'] })),
      }));

      vi.doMock('@toolkit/Secrets/EnvFile', () => ({
        EnvFile: { read: vi.fn(async () => ({ APP_KEY: 'x' })) },
      }));

      const { PutCommand } = await import('@cli/commands/PutCommand');
      await expect(
        PutCommand.create().execute({
          args: ['cloudflare'],
          wg: 'staging',
          var: 'proxy_env',
          env_path: '.env',
          config: 'missing.jsonc',
        } as any)
      ).rejects.toThrow(/Wrangler config not found: missing\.jsonc/);
    });

    it('includes --config when calling wrangler secret put', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@common/index', () => ({ resolveNpmPath: () => 'npm' }));
      vi.doMock('@config/app', () => ({ appConfig: { getSafeEnv: () => process.env } }));

      const execFileSync = vi.fn();
      vi.doMock('@node-singletons/child-process', () => ({ execFileSync }));

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(
          (p: string) => p === '/cwd/.zintrust.json' || p === '/cwd/wrangler.containers-proxy.jsonc'
        ),
        readFileSync: vi.fn(() => JSON.stringify({ proxy_env: ['APP_KEY'] })),
      }));

      vi.doMock('@toolkit/Secrets/EnvFile', () => ({
        EnvFile: { read: vi.fn(async () => ({ APP_KEY: 'super-secret' })) },
      }));

      const { PutCommand } = await import('@cli/commands/PutCommand');
      await PutCommand.create().execute({
        args: ['cloudflare'],
        wg: 'staging',
        var: 'proxy_env',
        env_path: '.env',
        config: 'wrangler.containers-proxy.jsonc',
      } as any);

      expect(execFileSync).toHaveBeenCalled();
      const call = execFileSync.mock.calls[0];
      expect(call?.[0]).toBe('npm');
      expect(call?.[1]).toEqual(
        expect.arrayContaining([
          '--config',
          'wrangler.containers-proxy.jsonc',
          'secret',
          'put',
          'APP_KEY',
        ])
      );
    });
  });
});
