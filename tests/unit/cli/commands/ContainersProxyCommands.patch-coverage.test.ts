/* eslint-disable max-nested-callbacks */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Cloudflare Containers proxy CLI commands (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('DockerCommand', () => {
    it('registers a `push` subcommand for Docker Hub publishing', async () => {
      const { DockerCommand } = await import('@cli/commands/DockerCommand');
      const program = DockerCommand.create().getCommand();

      const subcommandNames = program.commands.map((c) => c.name());
      expect(subcommandNames).toContain('push');
    });

    it('spawns wrangler dev with explicit config/env/port and exits with the returned code', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${String(code)}`);
      }) as never);

      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => true),
        readdirSync: vi.fn(() => []),
        renameSync: vi.fn(),
        unlinkSync: vi.fn(),
      }));
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
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => true),
        readdirSync: vi.fn(() => []),
        renameSync: vi.fn(),
        unlinkSync: vi.fn(),
      }));
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
        readdirSync: vi.fn(() => []),
        renameSync: vi.fn(),
        unlinkSync: vi.fn(),
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

    it('uses one deterministic backup per dev vars file and removes legacy UUID backups', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${String(code)}`);
      }) as never);

      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      const existingPaths = new Set<string>([
        '/cwd/wrangler.jsonc',
        '/cwd/.dev.vars',
        '/cwd/.dev.vars.disabled-by-zin-legacy-a',
        '/cwd/.dev.vars.disabled-by-zin-legacy-b',
      ]);

      const renameSync = vi.fn((from: string, to: string) => {
        existingPaths.delete(from);
        existingPaths.add(to);
      });
      const unlinkSync = vi.fn((value: string) => {
        existingPaths.delete(value);
      });

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn((value: string) => existingPaths.has(value)),
        readdirSync: vi.fn(() => Array.from(existingPaths, (value) => value.replace('/cwd/', ''))),
        renameSync,
        unlinkSync,
      }));
      vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
      const spawnAndWait = vi.fn(async () => 0);
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));

      const { DockerCommand } = await import('@cli/commands/DockerCommand');

      await expect(
        DockerCommand.create().execute({ wranglerConfig: 'wrangler.jsonc' })
      ).rejects.toThrow('exit:0');

      expect(unlinkSync).toHaveBeenCalledWith('/cwd/.dev.vars.disabled-by-zin-legacy-a');
      expect(unlinkSync).toHaveBeenCalledWith('/cwd/.dev.vars.disabled-by-zin-legacy-b');
      expect(renameSync).toHaveBeenNthCalledWith(
        1,
        '/cwd/.dev.vars',
        '/cwd/.dev.vars.disabled-by-zin'
      );
      expect(renameSync).toHaveBeenNthCalledWith(
        2,
        '/cwd/.dev.vars.disabled-by-zin',
        '/cwd/.dev.vars'
      );

      exitSpy.mockRestore();
    });

    it('throws when an explicit --wrangler-config file does not exist', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => false),
        readdirSync: vi.fn(() => []),
        renameSync: vi.fn(),
        unlinkSync: vi.fn(),
      }));

      const { DockerCommand } = await import('@cli/commands/DockerCommand');
      await expect(
        DockerCommand.create().execute({ wranglerConfig: 'missing.jsonc' })
      ).rejects.toThrow(/Wrangler config not found: missing\.jsonc/);
    });

    it('throws when no wrangler config can be resolved', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => false),
        readdirSync: vi.fn(() => []),
        renameSync: vi.fn(),
        unlinkSync: vi.fn(),
      }));

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
        renameSync: vi.fn(),
      }));
      vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
      const syncCloudflareSecrets = vi.fn(async () => ({
        selectedKeys: [],
        pushedKeys: [],
        failures: [],
        dryRun: false,
      }));
      const reportCloudflareSecretSync = vi.fn();
      vi.doMock('@cli/cloudflare/CloudflareSecretSync', () => ({
        syncCloudflareSecrets,
        reportCloudflareSecretSync,
      }));
      const spawnAndWait = vi.fn(async () => 0);
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));

      const { DeployContainersProxyCommand } =
        await import('@cli/commands/DeployContainersProxyCommand');

      await expect(DeployContainersProxyCommand.create().execute({})).rejects.toThrow('exit:0');
      expect(syncCloudflareSecrets).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/cwd',
          configPath: 'wrangler.containers-proxy.jsonc',
          wranglerEnvs: ['production'],
          envPath: '.env',
          requireSelection: false,
        })
      );
      expect(reportCloudflareSecretSync).not.toHaveBeenCalled();
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
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn(() => false),
        renameSync: vi.fn(),
      }));

      const { DeployContainersProxyCommand } =
        await import('@cli/commands/DeployContainersProxyCommand');
      await expect(
        DeployContainersProxyCommand.create().execute({ config: 'missing.jsonc' })
      ).rejects.toThrow(/Wrangler config not found/i);
    });

    it('skips secret sync when disabled', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${String(code)}`);
      }) as never);

      vi.spyOn(process, 'cwd').mockReturnValue('/cwd');

      vi.doMock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));
      vi.doMock('@node-singletons/fs', () => ({
        existsSync: vi.fn((path: string) => path === '/cwd/wrangler.containers-proxy.jsonc'),
        renameSync: vi.fn(),
      }));
      const syncCloudflareSecrets = vi.fn(async () => ({
        selectedKeys: ['APP_KEY'],
        pushedKeys: ['APP_KEY'],
        failures: [],
        dryRun: false,
      }));
      vi.doMock('@cli/cloudflare/CloudflareSecretSync', () => ({
        syncCloudflareSecrets,
        reportCloudflareSecretSync: vi.fn(),
      }));
      vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
      const spawnAndWait = vi.fn(async () => 0);
      vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));

      const { DeployContainersProxyCommand } =
        await import('@cli/commands/DeployContainersProxyCommand');

      await expect(
        DeployContainersProxyCommand.create().execute({ syncSecrets: false })
      ).rejects.toThrow('exit:0');

      expect(syncCloudflareSecrets).not.toHaveBeenCalled();
      exitSpy.mockRestore();
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
        renameSync: vi.fn(),
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
        renameSync: vi.fn(),
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
        renameSync: vi.fn(),
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
