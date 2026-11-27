/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  useDatabase: vi.fn(),
  registerDatabases: vi.fn(),
  ping: vi.fn(),
  buildHealthResponse: vi.fn((status: string, env: string, extra: unknown) => ({ status, env, ...(extra as any) })),
  buildErrorResponse: vi.fn(
    (status: string, env: string, _error: unknown, extra: unknown) => ({
      status,
      env,
      ...(extra as any),
    })
  ),
  getUptime: vi.fn(() => 1),
  pingKvCache: vi.fn(),
  getCacheDriverName: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@core-routes/Router', () => ({
  Router: {
    get: (_router: unknown, path: string, handler: any) => {
      mocks.handlers[path] = handler;
    },
  },
}));
vi.mock('@orm/Database', () => ({ useDatabase: mocks.useDatabase }));
vi.mock('@orm/QueryBuilder', () => ({ QueryBuilder: { ping: mocks.ping } }));
vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: mocks.registerDatabases,
}));
vi.mock('@common/ExternalServiceUtils', () => ({
  HealthUtils: {
    buildHealthResponse: mocks.buildHealthResponse,
    buildErrorResponse: mocks.buildErrorResponse,
    getUptime: mocks.getUptime,
  },
}));
vi.mock('@/health/RuntimeHealthProbes', () => ({
  RuntimeHealthProbes: {
    pingKvCache: mocks.pingKvCache,
    getCacheDriverName: mocks.getCacheDriverName,
  },
}));
vi.mock('@config/env', () => ({ Env: { NODE_ENV: 'test' } }));
vi.mock('@config/app', () => ({ appConfig: { environment: 'test' } }));
vi.mock('@config/database', () => ({ databaseConfig: {} }));
vi.mock('@config/logger', () => ({
  Logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}));

import { registerHealthRoutes } from '@common/HealthRoutes';

const res = () => {
  const r: any = { statusCode: 200 };
  r.json = vi.fn(() => r);
  r.setStatus = vi.fn((code: number) => {
    r.statusCode = code;
    return r;
  });
  return r;
};

const missingDbError = () => {
  const error = new Error("Database connection 'default' is not registered") as any;
  error.name = 'ConfigError';
  error.code = 'CONFIG_ERROR';
  return error;
};

describe('HealthRoutes branches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.handlers = {};
    mocks.getUptime.mockReturnValue(1);
    mocks.ping.mockResolvedValue(undefined);
    mocks.pingKvCache.mockResolvedValue(null);
    mocks.getCacheDriverName.mockReturnValue('local');
    mocks.useDatabase.mockReturnValue({});
    registerHealthRoutes({} as any);
  });

  it('health: connects disconnected db and reports connected', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    mocks.useDatabase.mockReturnValue({ isConnected: () => false, connect });
    const response = res();
    await mocks.handlers['/health']({}, response);
    expect(connect).toHaveBeenCalled();
    expect(mocks.ping).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ database: 'connected' }));
  });

  it('health: registers databases when default is missing, then reports connected', async () => {
    mocks.useDatabase.mockImplementationOnce(() => {
      throw missingDbError();
    });
    const response = res();
    await mocks.handlers['/health']({}, response);
    expect(mocks.registerDatabases).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ database: 'connected' }));
  });

  it('health: reports unconfigured when registration also fails', async () => {
    mocks.useDatabase.mockImplementation(() => {
      throw missingDbError();
    });
    mocks.registerDatabases.mockImplementation(() => {
      throw new Error('registration failed');
    });
    const response = res();
    await mocks.handlers['/health']({}, response);
    expect(mocks.loggerWarn).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ database: 'unconfigured' }));
  });

  it('health: unrelated database errors produce unhealthy 503', async () => {
    for (const error of [
      'string error',
      { name: 'Other', code: 'CONFIG_ERROR' },
      { name: 'ConfigError', code: 'OTHER' },
      { name: 'ConfigError', code: 'CONFIG_ERROR' },
      { name: 'ConfigError', code: 'CONFIG_ERROR', message: 42 },
    ]) {
      mocks.useDatabase.mockImplementationOnce(() => {
        throw error;
      });
      const response = res();
      await mocks.handlers['/health']({}, response);
      expect(response.statusCode).toBe(503);
      expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ database: 'disconnected' }));
    }
  });

  it('live route reports alive', () => {
    const response = res();
    mocks.handlers['/health/live']({}, response);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'alive' }));
  });

  it('ready route: unconfigured database and optional cache timing', async () => {
    mocks.useDatabase.mockImplementation(() => {
      throw missingDbError();
    });
    mocks.registerDatabases.mockImplementation(() => {
      throw new Error('nope');
    });
    const unconfigured = res();
    await mocks.handlers['/health/ready']({}, unconfigured);
    expect(unconfigured.json).toHaveBeenCalledWith(
      expect.objectContaining({ dependencies: { database: { status: 'unconfigured', responseTime: 0 } } })
    );

    mocks.useDatabase.mockReturnValue({ isConnected: () => true });
    mocks.pingKvCache.mockResolvedValueOnce(7);
    const ready = res();
    await mocks.handlers['/health/ready']({}, ready);
    expect(ready.json).toHaveBeenCalledWith(
      expect.objectContaining({ dependencies: expect.objectContaining({ cache: { status: 'ready', responseTime: 7 } }) })
    );
  });

  it('ready route: ping failure reports not_ready and kv cache unavailable', async () => {
    mocks.ping.mockRejectedValueOnce(new Error('ping failed'));
    mocks.getCacheDriverName.mockReturnValue('kv');
    const response = res();
    await mocks.handlers['/health/ready']({}, response);
    expect(response.statusCode).toBe(503);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        dependencies: expect.objectContaining({
          database: expect.objectContaining({ status: 'unavailable' }),
          cache: expect.objectContaining({ status: 'unavailable' }),
        }),
      })
    );
  });
});
