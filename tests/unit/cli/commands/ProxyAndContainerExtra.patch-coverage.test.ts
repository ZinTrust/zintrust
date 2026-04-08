import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const proxyExtraMocks = vi.hoisted(() => ({
  ensureLoaded: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => proxyExtraMocks.existsSync(...args),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
  dirname: (value: string) => value.split('/').slice(0, -1).join('/') || '/',
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn(async () => 0) },
}));

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: (...args: unknown[]) => proxyExtraMocks.ensureLoaded(...args),
  },
}));

vi.mock('@proxy/mongodb/MongoDBProxyServer', () => ({
  MongoDBProxyServer: { start: vi.fn(async () => undefined) },
}));

vi.mock('@proxy/sqlserver/SqlServerProxyServer', () => ({
  SqlServerProxyServer: { start: vi.fn(async () => undefined) },
}));

describe('proxy/container extra patch coverage', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    process.argv = ['node', 'bin/zin.ts'];
    process.env = { ...originalEnv };
    proxyExtraMocks.existsSync.mockImplementation(
      (value: string) => value === `${process.cwd()}/package.json`
    );
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('DockerComposeCommandUtils resolves path and handles fallback', async () => {
    const fsMod = await import('@node-singletons/fs');
    const { SpawnUtil } = await import('@cli/utils/spawn');
    const { Logger } = await import('@config/logger');

    expect(fsMod.existsSync).toBeDefined();
    proxyExtraMocks.existsSync.mockReturnValue(true);

    const { resolveComposePath, runComposeWithFallback } =
      await import('@cli/commands/DockerComposeCommandUtils');

    expect(resolveComposePath('docker-compose.yml', 'missing')).toBe(
      `${process.cwd()}/docker-compose.yml`
    );

    vi.mocked(SpawnUtil.spawnAndWait)
      .mockRejectedValueOnce(new Error("'docker' not found"))
      .mockResolvedValueOnce(0);

    await runComposeWithFallback(['compose', '-f', 'docker-compose.yml', 'up']);

    expect(Logger.warn).toHaveBeenCalledWith(
      "'docker' not found. Falling back to 'docker-compose'."
    );
    expect(SpawnUtil.spawnAndWait).toHaveBeenLastCalledWith({
      command: 'docker-compose',
      args: ['-f', 'docker-compose.yml', 'up'],
    });
  });

  it('ProxyCommandUtils parses numeric options and watch mode spawn', async () => {
    const { SpawnUtil } = await import('@cli/utils/spawn');
    const { parseIntOption, trimOption, maybeRunProxyWatchMode } =
      await import('@cli/commands/ProxyCommandUtils');

    expect(parseIntOption(undefined, 'port')).toBeUndefined();
    expect(parseIntOption('3', 'port')).toBe(3);
    expect(parseIntOption('0', 'db', 'non-negative')).toBe(0);
    expect(() => parseIntOption('0', 'port')).toThrow(/Invalid --port/);
    expect(trimOption('  hi  ')).toBe('hi');

    process.argv = ['node', 'bin/zin.ts', 'proxy:sqlserver', '--watch', '--port', '8793'];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    await expect(maybeRunProxyWatchMode(true)).rejects.toThrow('exit:0');
    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tsx',
        args: ['watch', 'bin/zin.ts', 'proxy:sqlserver', '--port', '8793'],
      })
    );
    exitSpy.mockRestore();
  });

  it('ContainerProxiesCommand executes build/up/down paths and validates action', async () => {
    const { runComposeWithFallback, resolveComposePath } =
      await import('@cli/commands/DockerComposeCommandUtils');
    const runSpy = vi.spyOn(
      await import('@cli/commands/DockerComposeCommandUtils'),
      'runComposeWithFallback'
    );
    vi.spyOn(
      await import('@cli/commands/DockerComposeCommandUtils'),
      'resolveComposePath'
    ).mockReturnValue('/project/docker-compose.proxy.yml');

    const { ContainerProxiesCommand } = await import('@cli/commands/ContainerProxiesCommand');

    await ContainerProxiesCommand.create().execute({
      args: ['build'],
      noCache: true,
      pull: true,
    } as any);

    await ContainerProxiesCommand.create().execute({
      args: ['up'],
      build: true,
      detach: true,
      removeOrphans: true,
    } as any);

    await ContainerProxiesCommand.create().execute({
      args: ['down'],
      volumes: true,
      removeOrphans: true,
    } as any);

    expect(resolveComposePath).toBeDefined();
    expect(runComposeWithFallback).toBeDefined();
    expect(runSpy).toHaveBeenCalled();

    await expect(
      ContainerProxiesCommand.create().execute({ args: ['bad'] } as any)
    ).rejects.toThrow(/Usage: zin cp/);
  });

  it('ContainerWorkers and DeployContainerProxies commands execute expected compose args', async () => {
    const utils = await import('@cli/commands/DockerComposeCommandUtils');
    vi.spyOn(utils, 'resolveComposePath')
      .mockReturnValueOnce('/project/docker-compose.workers.yml')
      .mockReturnValueOnce('/project/docker-compose.proxy.yml');
    const runSpy = vi.spyOn(utils, 'runComposeWithFallback').mockResolvedValue(undefined);

    const { ContainerWorkersCommand } = await import('@cli/commands/ContainerWorkersCommand');
    const { DeployContainerProxiesCommand } =
      await import('@cli/commands/DeployContainerProxiesCommand');

    await ContainerWorkersCommand.create().execute({
      args: ['up'],
      build: true,
      detach: true,
      noCache: true,
      pull: true,
    } as any);

    await DeployContainerProxiesCommand.create().execute({
      noBuild: false,
      removeOrphans: true,
    } as any);

    expect(runSpy).toHaveBeenCalled();
    await expect(
      ContainerWorkersCommand.create().execute({ args: ['bad'] } as any)
    ).rejects.toThrow(/Usage: zin cw/);
  });

  it('MongoDBProxyCommand validates required options and starts server', async () => {
    const { MongoDBProxyServer } = await import('@proxy/mongodb/MongoDBProxyServer');
    const { MongoDBProxyCommand } = await import('@cli/commands/MongoDBProxyCommand');

    const cmd = MongoDBProxyCommand.create();

    await cmd.parseAsync(['node', 'proxy:mongodb'], { from: 'node' });
    expect(MongoDBProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({ mongoUri: '', mongoDb: '' })
    );

    await cmd.parseAsync(
      [
        'node',
        'proxy:mongodb',
        '--mongo-uri',
        'mongodb://localhost:27017',
        '--mongo-db',
        'app',
        '--host',
        '127.0.0.1',
        '--port',
        '8792',
      ],
      { from: 'node' }
    );

    expect(MongoDBProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({ mongoUri: 'mongodb://localhost:27017', mongoDb: 'app', port: 8792 })
    );
  });

  it('SqlServerProxyCommand starts server with parsed options', async () => {
    const { SqlServerProxyServer } = await import('@proxy/sqlserver/SqlServerProxyServer');
    const { SqlServerProxyCommand } = await import('@cli/commands/SqlServerProxyCommand');

    const cmd = SqlServerProxyCommand.create();
    await cmd.parseAsync(
      [
        'node',
        'proxy:sqlserver',
        '--host',
        '127.0.0.1',
        '--port',
        '8793',
        '--db-host',
        'localhost',
        '--db-port',
        '1433',
        '--db-name',
        'zintrust',
      ],
      { from: 'node' }
    );

    expect(SqlServerProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({ host: '127.0.0.1', port: 8793, dbPort: 1433 })
    );
  });

  it('direct Commander proxies load project env and resolve live defaults during option wiring', async () => {
    vi.stubEnv('MONGO_URI', 'mongodb://root-env:27017');
    vi.stubEnv('MONGO_DB', 'rootdb');
    vi.stubEnv('MONGODB_PROXY_REQUIRE_SIGNING', 'false');
    vi.stubEnv('SQLSERVER_PROXY_PORT', '9903');

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo/apps/api');
    proxyExtraMocks.existsSync.mockImplementation(
      (value: string) => value === '/repo/package.json'
    );

    const { MongoDBProxyServer } = await import('@proxy/mongodb/MongoDBProxyServer');
    const { SqlServerProxyServer } = await import('@proxy/sqlserver/SqlServerProxyServer');
    const { MongoDBProxyCommand } = await import('@cli/commands/MongoDBProxyCommand');
    const { SqlServerProxyCommand } = await import('@cli/commands/SqlServerProxyCommand');

    await MongoDBProxyCommand.create().parseAsync(['node', 'proxy:mongodb'], { from: 'node' });
    await SqlServerProxyCommand.create().parseAsync(['node', 'proxy:sqlserver'], { from: 'node' });

    expect(proxyExtraMocks.ensureLoaded).toHaveBeenCalledWith({
      cwd: '/repo',
      includeCwd: true,
      extraCwds: ['/repo/apps/api'],
    });
    expect(MongoDBProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({
        mongoUri: 'mongodb://root-env:27017',
        mongoDb: 'rootdb',
        requireSigning: false,
      })
    );
    expect(SqlServerProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({ port: 9903 })
    );

    cwdSpy.mockRestore();
  });
});
