import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    handle: vi.fn(),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn(async () => 0) },
}));

vi.mock('@proxy/ProxyRegistry', () => ({
  ProxyRegistry: { list: vi.fn(() => []) },
}));

vi.mock('@proxy/mysql/MySqlProxyServer', () => ({
  MySqlProxyServer: { start: vi.fn(async () => undefined) },
}));

vi.mock('@proxy/postgres/PostgresProxyServer', () => ({
  PostgresProxyServer: { start: vi.fn(async () => undefined) },
}));

vi.mock('@proxy/redis/RedisProxyServer', () => ({
  RedisProxyServer: { start: vi.fn(async () => undefined) },
}));

vi.mock('@proxy/smtp/SmtpProxyServer', () => ({
  SmtpProxyServer: { start: vi.fn(async () => undefined) },
}));

vi.mock('@proxy/d1/register', () => ({}));
vi.mock('@proxy/kv/register', () => ({}));
vi.mock('@proxy/mysql/register', () => ({}));
vi.mock('@proxy/postgres/register', () => ({}));
vi.mock('@proxy/redis/register', () => ({}));
vi.mock('@proxy/smtp/register', () => ({}));

describe('Proxy command patch coverage', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.argv = ['node', 'bin/zin.ts'];
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it('ProxyCommand dispatches target aliases and forwards args', async () => {
    const { SpawnUtil } = await import('@cli/utils/spawn');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    process.argv = ['node', 'bin/zin.ts', 'proxy', 'pg', '--foo', 'bar'];
    const { ProxyCommand } = await import('@cli/commands/ProxyCommand');

    await expect(ProxyCommand.create().execute({ args: ['pg'] })).rejects.toThrow('exit:0');
    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tsx',
        args: ['bin/zin.ts', 'proxy:postgres', '--foo', 'bar'],
      })
    );
    exitSpy.mockRestore();
  });

  it('ProxyCommand throws on unknown target and empty registry', async () => {
    const { ProxyCommand } = await import('@cli/commands/ProxyCommand');
    const { ProxyRegistry } = await import('@proxy/ProxyRegistry');

    await expect(ProxyCommand.create().execute({ args: ['unknown'] })).rejects.toThrow(
      /Unknown proxy target/
    );

    vi.mocked(ProxyRegistry.list).mockReturnValue([] as any);
    await expect(ProxyCommand.create().execute({})).rejects.toThrow(/No proxies registered/);
  });

  it('ProxyCommand lists registered proxies', async () => {
    const { ProxyCommand } = await import('@cli/commands/ProxyCommand');
    const { ProxyRegistry } = await import('@proxy/ProxyRegistry');
    const { ErrorHandler } = await import('@cli/ErrorHandler');

    vi.mocked(ProxyRegistry.list).mockReturnValue([
      { name: 'redis', description: 'Redis proxy' },
    ] as any);

    await ProxyCommand.create().execute({});
    expect(ErrorHandler.info).toHaveBeenCalledWith('redis: Redis proxy');
  });

  it('MySqlProxyCommand validates options, watch mode, and start options', async () => {
    const { MySqlProxyCommand } = await import('@cli/commands/MySqlProxyCommand');
    const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
    const { SpawnUtil } = await import('@cli/utils/spawn');

    await expect(MySqlProxyCommand.create().execute({ port: 'abc' } as any)).rejects.toThrow(
      /Invalid --port/
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);
    process.argv = ['node', 'bin/zin.ts', 'proxy:mysql', '--watch', '--port', '9977'];
    await expect(MySqlProxyCommand.create().execute({ watch: true } as any)).rejects.toThrow(
      'exit:0'
    );
    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['watch', 'bin/zin.ts', 'proxy:mysql', '--port', '9977'] })
    );
    exitSpy.mockRestore();

    await MySqlProxyCommand.create().execute({
      host: ' 127.0.0.1 ',
      port: '8792',
      maxBodyBytes: '1024',
      dbHost: ' localhost ',
      dbPort: '3306',
      dbName: ' app ',
      dbUser: ' root ',
      dbPass: 'pw',
      connectionLimit: '10',
      requireSigning: true,
      keyId: 'k',
      secret: 's',
      signingWindowMs: '5000',
    } as any);

    expect(MySqlProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 8792,
        dbHost: 'localhost',
        dbPort: 3306,
        dbName: 'app',
        dbUser: 'root',
        requireSigning: true,
      })
    );
  });

  it('PostgresProxyCommand validates and starts server', async () => {
    const { PostgresProxyCommand } = await import('@cli/commands/PostgresProxyCommand');
    const { PostgresProxyServer } = await import('@proxy/postgres/PostgresProxyServer');

    await expect(PostgresProxyCommand.create().execute({ dbPort: '-1' } as any)).rejects.toThrow(
      /Invalid --db-port/
    );

    await PostgresProxyCommand.create().execute({
      host: ' 0.0.0.0 ',
      port: '8793',
      maxBodyBytes: '2048',
      dbHost: ' psql ',
      dbPort: '5432',
      dbName: ' db ',
      dbUser: ' user ',
      dbPass: 'pw',
      connectionLimit: '12',
      requireSigning: false,
      keyId: 'k',
      secret: 's',
      signingWindowMs: '6000',
    } as any);

    expect(PostgresProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({ host: '0.0.0.0', port: 8793, dbPort: 5432, dbHost: 'psql' })
    );
  });

  it('PostgresProxyCommand watch mode spawns tsx watcher', async () => {
    const { PostgresProxyCommand } = await import('@cli/commands/PostgresProxyCommand');
    const { SpawnUtil } = await import('@cli/utils/spawn');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    process.argv = ['node', 'bin/zin.ts', 'proxy:postgres', '--watch', '--port', '8899'];
    await expect(PostgresProxyCommand.create().execute({ watch: true } as any)).rejects.toThrow(
      'exit:0'
    );

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['watch', 'bin/zin.ts', 'proxy:postgres', '--port', '8899'],
      })
    );
    exitSpy.mockRestore();
  });

  it('RedisProxyCommand allows non-negative numeric options', async () => {
    const { RedisProxyCommand } = await import('@cli/commands/RedisProxyCommand');
    const { RedisProxyServer } = await import('@proxy/redis/RedisProxyServer');

    await expect(RedisProxyCommand.create().execute({ redisDb: '-2' } as any)).rejects.toThrow(
      /Invalid --redis-db/
    );

    await RedisProxyCommand.create().execute({
      host: ' 127.0.0.1 ',
      port: '8791',
      maxBodyBytes: '2048',
      redisHost: ' cache ',
      redisPort: '6379',
      redisPassword: 'pw',
      redisDb: '0',
      requireSigning: true,
      keyId: 'kid',
      secret: 'sec',
      signingWindowMs: '60000',
    } as any);

    expect(RedisProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({ redisHost: 'cache', redisDb: 0, requireSigning: true })
    );
  });

  it('RedisProxyCommand watch mode spawns tsx watcher', async () => {
    const { RedisProxyCommand } = await import('@cli/commands/RedisProxyCommand');
    const { SpawnUtil } = await import('@cli/utils/spawn');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    process.argv = ['node', 'bin/zin.ts', 'proxy:redis', '--watch', '--port', '8891'];
    await expect(RedisProxyCommand.create().execute({ watch: true } as any)).rejects.toThrow(
      'exit:0'
    );

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['watch', 'bin/zin.ts', 'proxy:redis', '--port', '8891'],
      })
    );
    exitSpy.mockRestore();
  });

  it('SmtpProxyCommand validates and starts server', async () => {
    const { SmtpProxyCommand } = await import('@cli/commands/SmtpProxyCommand');
    const { SmtpProxyServer } = await import('@proxy/smtp/SmtpProxyServer');

    await expect(SmtpProxyCommand.create().execute({ smtpPort: '0' } as any)).rejects.toThrow(
      /Invalid --smtp-port/
    );

    await SmtpProxyCommand.create().execute({
      host: ' 127.0.0.1 ',
      port: '8794',
      maxBodyBytes: '2048',
      smtpHost: ' smtp.example.com ',
      smtpPort: '587',
      smtpUsername: ' user ',
      smtpPassword: 'pw',
      smtpSecure: 'starttls',
      requireSigning: true,
      keyId: 'k',
      secret: 's',
      signingWindowMs: '7000',
    } as any);

    expect(SmtpProxyServer.start).toHaveBeenCalledWith(
      expect.objectContaining({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpSecure: 'starttls',
      })
    );
  });

  it('SmtpProxyCommand watch mode spawns tsx watcher', async () => {
    const { SmtpProxyCommand } = await import('@cli/commands/SmtpProxyCommand');
    const { SpawnUtil } = await import('@cli/utils/spawn');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    process.argv = ['node', 'bin/zin.ts', 'proxy:smtp', '--watch', '--port', '8894'];
    await expect(SmtpProxyCommand.create().execute({ watch: true } as any)).rejects.toThrow(
      'exit:0'
    );

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['watch', 'bin/zin.ts', 'proxy:smtp', '--port', '8894'],
      })
    );
    exitSpy.mockRestore();
  });
});
