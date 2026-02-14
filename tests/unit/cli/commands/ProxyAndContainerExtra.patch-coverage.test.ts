import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn(async () => 0) },
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
    process.argv = ['node', 'bin/zin.ts'];
    process.env = { ...originalEnv };
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

    vi.mocked(fsMod.existsSync).mockReturnValue(true);

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
});
