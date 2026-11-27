import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProxyEnvLoadedForCwd: vi.fn(),
  maybeRunProxyWatchMode: vi.fn(async () => undefined),
  parseIntOption: vi.fn((raw: string | undefined) =>
    raw === undefined ? undefined : Number.parseInt(raw, 10)
  ),
  trimOption: vi.fn((value: string | undefined) =>
    typeof value === 'string' ? value.trim() || undefined : undefined
  ),
  listenRedisRpcServer: vi.fn(),
  info: vi.fn(),
  envValues: {} as Record<string, string | number | boolean>,
  signalHandlers: {} as Record<string, () => void>,
  failServerImport: false,
}));

vi.mock('@cli/commands/ProxyCommandUtils', () => ({
  ensureProxyEnvLoadedForCwd: mocks.ensureProxyEnvLoadedForCwd,
  maybeRunProxyWatchMode: mocks.maybeRunProxyWatchMode,
  parseIntOption: mocks.parseIntOption,
  trimOption: mocks.trimOption,
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: mocks.info,
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback: unknown) => mocks.envValues[key] ?? fallback,
    getInt: (key: string, fallback: number) => mocks.envValues[key] ?? fallback,
    getBool: (key: string, fallback: boolean) => mocks.envValues[key] ?? fallback,
    REDIS_DB: 3,
    REDIS_QUEUE_DB: 4,
  },
}));

const SERVER_SPECIFIER = '@zintrust/redis-rpc/server';
const SERVER_MODULE_PATH =
  '/opt/homebrew/var/www/Sites/zintrust/node_modules/@zintrust/redis-rpc/dist/server.js';

const createdServer = () => ({
  backend: { close: vi.fn(async () => undefined) },
  server: { close: vi.fn((cb?: () => void) => cb?.()) },
  settings: { host: '127.0.0.1', port: 8794 },
});

type RedisRpcCommandType = typeof import('@cli/commands/RedisRpcCommand').RedisRpcCommand;

describe('RedisRpcCommand uncovered branches', () => {
  let RedisRpcCommand: RedisRpcCommandType;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  const loadCommand = async () => {
    vi.resetModules();
    mocks.failServerImport = false;
    vi.doMock(SERVER_SPECIFIER, () => ({
      listenRedisRpcServer: (...args: unknown[]) => mocks.listenRedisRpcServer(...args),
    }));
    ({ RedisRpcCommand } = await import('@cli/commands/RedisRpcCommand'));
  };

  const runExecute = async (options: Record<string, unknown>) => {
    const command = RedisRpcCommand.create();
    const executing = (command.execute as (opts: Record<string, unknown>) => Promise<void>)(options);

    await vi.waitFor(() => {
      if (mocks.signalHandlers['SIGINT'] === undefined) throw new Error('handlers not registered');
    }, { timeout: 3000 });

    mocks.signalHandlers['SIGINT']?.();
    await executing;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.envValues = {};
    mocks.signalHandlers = {};
    mocks.listenRedisRpcServer.mockResolvedValue(createdServer());

    vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => {
      mocks.signalHandlers[event] = handler;
      return process;
    }) as never);
    vi.spyOn(process, 'off').mockImplementation((() => process) as never);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await loadCommand();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.restoreAllMocks();
    vi.doUnmock(SERVER_SPECIFIER);
    vi.doUnmock(SERVER_MODULE_PATH);
  });

  it('omits every optional server/Redis option when nothing is provided', async () => {
    await runExecute({});

    expect(mocks.listenRedisRpcServer).toHaveBeenCalledWith({});
    expect(mocks.maybeRunProxyWatchMode).toHaveBeenCalledWith(undefined);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('sets defined server options and builds Redis options from explicit values', async () => {
    await runExecute({
      host: ' 0.0.0.0 ',
      port: '9000',
      secret: ' shared ',
      prefix: ' bull ',
      redisHost: ' cache ',
      redisPort: '0',
      redisPassword: 'secret',
      redisDb: '0',
    });

    expect(mocks.listenRedisRpcServer).toHaveBeenCalledWith({
      host: '0.0.0.0',
      port: 9000,
      secret: 'shared',
      prefix: 'bull',
      redis: {
        host: 'cache',
        port: 0,
        password: 'secret',
        db: 0,
        maxRetriesPerRequest: null,
      },
    });
  });

  it('falls back to primary Redis env vars when only a Redis option is present', async () => {
    mocks.envValues = {
      REDIS_RPC_REDIS_HOST: 'rpc-host',
      REDIS_HOST: 'global-host',
      REDIS_RPC_REDIS_PORT: 1111,
      REDIS_PORT: 2222,
      REDIS_RPC_REDIS_DB: 5,
      REDIS_QUEUE_DB: 6,
    };

    await runExecute({ redisPassword: '' });

    expect(mocks.listenRedisRpcServer).toHaveBeenCalledWith({
      redis: {
        host: 'rpc-host',
        port: 1111,
        password: undefined,
        db: 5,
        maxRetriesPerRequest: null,
      },
    });
  });

  it('falls back to generic Redis env vars when only secondary keys exist', async () => {
    mocks.envValues = {
      REDIS_HOST: 'global-host',
      REDIS_PORT: 3333,
      REDIS_QUEUE_DB: 7,
      REDIS_PASSWORD: 'global-password',
    };

    await runExecute({ redisDb: '1' });

    expect(mocks.listenRedisRpcServer).toHaveBeenCalledWith({
      redis: {
        host: 'global-host',
        port: 3333,
        password: 'global-password',
        db: 1,
        maxRetriesPerRequest: null,
      },
    });
  });

  it('uses deep defaults when env vars are absent', async () => {
    await runExecute({ redisHost: 'redis-host' });

    expect(mocks.listenRedisRpcServer).toHaveBeenCalledWith({
      redis: {
        host: 'redis-host',
        port: 6379,
        password: undefined,
        db: 3,
        maxRetriesPerRequest: null,
      },
    });
  });

  it('wraps a missing optional redis-rpc package in a CLI error', async () => {
    vi.doMock(SERVER_SPECIFIER, () => {
      throw new Error('Cannot find package @zintrust/redis-rpc');
    });
    vi.resetModules();
    ({ RedisRpcCommand } = await import('@cli/commands/RedisRpcCommand'));

    await expect(
      (RedisRpcCommand.create().execute as (opts: Record<string, unknown>) => Promise<void>)({})
    ).rejects.toThrow(/Install @zintrust\/redis-rpc/);
  });
});
