import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Cloudflare Containers proxy CLI commands (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('DockerCommand', () => {
    it('spawns wrangler dev with explicit config/env/port and exits with the returned code', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${String(code)}`);
      }) as never);

      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true) }));
      vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
      const spawnAndWait = vi.fn(async () => 0);
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));

      const { DockerCommand } = await import('@cli/commands/DockerCommand');

      await expect(
        DockerCommand.create().execute({
          wranglerConfig: 'custom.jsonc',
          env: 'staging',
          port: '8787',
        })
      ).rejects.toThrow('exit:0');

      expect(spawnAndWait).toHaveBeenCalledWith({
        command: 'wrangler',
        args: ['dev', '--config', 'custom.jsonc', '--port', '8787', '--env', 'staging'],
        env: process.env,
      });

      exitSpy.mockRestore();
    });

    it('throws a CLI error for invalid port input', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => true) }));
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait: vi.fn() } }));

      const { DockerCommand } = await import('@cli/commands/DockerCommand');

      await expect(
        DockerCommand.create().execute({
          wranglerConfig: 'wrangler.containers-proxy.jsonc',
          port: '99999',
        })
      ).rejects.toThrow(/Invalid --port/i);
    });

    it('falls back to a default wrangler config if no --wrangler-config is provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${String(code)}`);
      }) as never);

      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn((path: string) => path === '/cwd/wrangler.containers-proxy.jsonc'),
      }));
      vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
      const spawnAndWait = vi.fn(async () => 5);
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));

      const { DockerCommand } = await import('@cli/commands/DockerCommand');

      await expect(DockerCommand.create().execute({ env: 'staging' })).rejects.toThrow('exit:5');
      expect(spawnAndWait).toHaveBeenCalledWith({
        command: 'wrangler',
        args: ['dev', '--config', 'wrangler.containers-proxy.jsonc', '--env', 'staging'],
        env: process.env,
      });

      exitSpy.mockRestore();
    });

    it('throws when an explicit --wrangler-config file does not exist', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => false) }));

      const { DockerCommand } = await import('@cli/commands/DockerCommand');
      await expect(
        DockerCommand.create().execute({ wranglerConfig: 'missing.jsonc' })
      ).rejects.toThrow(/Wrangler config not found: missing\.jsonc/);
    });

    it('throws when no wrangler config can be resolved', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => false) }));

      const { DockerCommand } = await import('@cli/commands/DockerCommand');
      await expect(DockerCommand.create().execute({})).rejects.toThrow(
        /Wrangler config not found\. Expected wrangler\.containers-proxy\.jsonc/i
      );
    });
  });

  describe('DeployContainersProxyCommand', () => {
    it('deploys via wrangler with default config and env=production when omitted', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${String(code)}`);
      }) as never);

      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn((path: string) => path === '/cwd/wrangler.containers-proxy.jsonc'),
      }));
      vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
      const spawnAndWait = vi.fn(async () => 0);
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));

      const { DeployContainersProxyCommand } =
        await import('@cli/commands/DeployContainersProxyCommand');

      await expect(DeployContainersProxyCommand.create().execute({})).rejects.toThrow('exit:0');
      expect(spawnAndWait).toHaveBeenCalledWith({
        command: 'wrangler',
        args: ['deploy', '--config', 'wrangler.containers-proxy.jsonc', '--env', 'production'],
        env: process.env,
      });

      exitSpy.mockRestore();
    });

    it('throws when the wrangler config file does not exist', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');
      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({ existsSync: vi.fn(() => false) }));

      const { DeployContainersProxyCommand } =
        await import('@cli/commands/DeployContainersProxyCommand');
      await expect(
        DeployContainersProxyCommand.create().execute({ config: 'missing.jsonc' })
      ).rejects.toThrow(/Wrangler config not found/i);
    });
  });

  describe('InitContainersProxyCommand', () => {
    it('creates wrangler config + worker entry when files do not exist', async () => {
      const info = vi.fn();
      vi.doMock('@config/logger', () => ({ Logger: { info } }));
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      const confirm = vi.fn(async () => true);
      vi.doMock('@cli/PromptHelper', () => ({ PromptHelper: { confirm } }));

      const writeFileSync = vi.fn();
      const mkdirSync = vi.fn();
      const copyFileSync = vi.fn();

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => false),
        writeFileSync,
        mkdirSync,
        copyFileSync,
      }));

      const { InitContainersProxyCommand } =
        await import('@cli/commands/InitContainersProxyCommand');
      await InitContainersProxyCommand.create().execute({});

      // Creates src dir and writes both files
      expect(mkdirSync).toHaveBeenCalled();
      expect(copyFileSync).not.toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalledTimes(2);
      expect(info).toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('backs up and overwrites files when they exist and user confirms', async () => {
      const info = vi.fn();
      vi.doMock('@config/logger', () => ({ Logger: { info } }));
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      const confirm = vi.fn(async () => true);
      vi.doMock('@cli/PromptHelper', () => ({ PromptHelper: { confirm } }));

      const writeFileSync = vi.fn();
      const mkdirSync = vi.fn();
      const copyFileSync = vi.fn();

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => true),
        writeFileSync,
        mkdirSync,
        copyFileSync,
      }));

      const { InitContainersProxyCommand } =
        await import('@cli/commands/InitContainersProxyCommand');
      await InitContainersProxyCommand.create().execute({});

      expect(confirm).toHaveBeenCalled();
      expect(copyFileSync).toHaveBeenCalledTimes(2);
      expect(copyFileSync.mock.calls[0]?.[0]).toBe('/cwd/wrangler.containers-proxy.jsonc');
      expect(String(copyFileSync.mock.calls[0]?.[1])).toMatch(
        /wrangler\.containers-proxy\.jsonc\.bak\./
      );

      expect(copyFileSync.mock.calls[1]?.[0]).toBe('/cwd/src/containers-proxy.ts');
      expect(String(copyFileSync.mock.calls[1]?.[1])).toMatch(/containers-proxy\.ts\.bak\./);

      expect(writeFileSync).toHaveBeenCalledTimes(2);
      expect(mkdirSync).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalled();
    });

    it('skips overwriting when user declines', async () => {
      const info = vi.fn();
      vi.doMock('@config/logger', () => ({ Logger: { info } }));
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      const confirm = vi.fn(async () => false);
      vi.doMock('@cli/PromptHelper', () => ({ PromptHelper: { confirm } }));

      const writeFileSync = vi.fn();
      const mkdirSync = vi.fn();
      const copyFileSync = vi.fn();

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => true),
        writeFileSync,
        mkdirSync,
        copyFileSync,
      }));

      const { InitContainersProxyCommand } =
        await import('@cli/commands/InitContainersProxyCommand');
      await InitContainersProxyCommand.create().execute({});

      expect(confirm).toHaveBeenCalled();
      expect(writeFileSync).not.toHaveBeenCalled();
      expect(copyFileSync).not.toHaveBeenCalled();
    });
  });
});
