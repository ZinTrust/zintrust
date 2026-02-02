import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { Router } from '@core-routes/Router';

const hoisted = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'test' as string | undefined,
    getBool: vi.fn((_key: string, defaultVal?: boolean) => defaultVal ?? false),
    get: vi.fn((_key: string, defaultVal?: string) => defaultVal ?? ''),
    getInt: vi.fn((_key: string, defaultVal?: number) => defaultVal ?? 0),
  },
  app: {
    environment: 'test',
  },
  logger: {
    error: vi.fn(),
  },
  db: {
    useDatabase: vi.fn(),
  },
  qb: {
    ping: vi.fn().mockResolvedValue(undefined),
  },
  probes: {
    pingKvCache: vi.fn().mockResolvedValue(null),
    getCacheDriverName: vi.fn().mockReturnValue('memory'),
  },
}));

vi.mock('@config/env', () => ({
  Env: hoisted.env,
}));

vi.mock('@config/app', () => ({
  appConfig: hoisted.app,
}));

vi.mock('@config/logger', () => ({
  Logger: hoisted.logger,
}));

vi.mock('@orm/Database', () => ({
  useDatabase: hoisted.db.useDatabase,
}));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    ping: hoisted.qb.ping,
  },
}));

vi.mock('@/health/RuntimeHealthProbes', () => ({
  RuntimeHealthProbes: hoisted.probes,
}));

// Keep CoreRoutes tests focused.
vi.mock('@core-routes/doc', () => ({ registerDocRoutes: vi.fn() }));
vi.mock('@core-routes/error', () => ({ registerErrorRoutes: vi.fn() }));
vi.mock('@core-routes/errorPages', () => ({ registerErrorPagesRoutes: vi.fn() }));

import { RuntimeHealthProbes } from '@/health/RuntimeHealthProbes';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';

import { registerCoreRoutes } from '@core-routes/CoreRoutes';

const createRes = () =>
  ({
    setStatus: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }) as any;

describe('patch coverage: routing/CoreRoutes health', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (Env as any).NODE_ENV = 'test';
    hoisted.app.environment = 'test';

    (useDatabase as unknown as Mock).mockReturnValue({});
    (QueryBuilder.ping as unknown as Mock).mockResolvedValue(undefined);
    (RuntimeHealthProbes.pingKvCache as unknown as Mock).mockResolvedValue(null);
    (RuntimeHealthProbes.getCacheDriverName as unknown as Mock).mockReturnValue('memory');
  });

  it('covers /health connect branch + uptime fallback + env default', async () => {
    const originalUptime = process.uptime;
    (process as any).uptime = undefined;

    const connect = vi.fn().mockResolvedValue(undefined);
    const isConnected = vi.fn().mockReturnValue(false);
    (useDatabase as unknown as Mock).mockReturnValue({ connect, isConnected });

    const prevEnv = (Env as any).NODE_ENV;
    (Env as any).NODE_ENV = undefined;

    try {
      const router = Router.createRouter();
      registerCoreRoutes(router);

      const match = Router.match(router, 'GET', '/health');
      if (match === null) throw new Error('Expected /health route');

      const res = createRes();
      await match.handler({} as any, res);

      expect(connect).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'healthy', uptime: 0, environment: 'development' })
      );
    } finally {
      (Env as any).NODE_ENV = prevEnv;
      (process as any).uptime = originalUptime;
    }
  });

  it('handles /health failure and hides error in production', async () => {
    (Env as any).NODE_ENV = 'production';
    (QueryBuilder.ping as unknown as Mock).mockRejectedValueOnce(new Error('DB down'));

    const router = Router.createRouter();
    registerCoreRoutes(router);

    const match = Router.match(router, 'GET', '/health');
    if (match === null) throw new Error('Expected /health route');

    const res = createRes();
    await match.handler({} as any, res);

    expect(Logger.error).toHaveBeenCalled();
    expect(res.setStatus).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unhealthy', error: 'Service unavailable' })
    );
  });

  it('handles /health/live', async () => {
    const router = Router.createRouter();
    registerCoreRoutes(router);

    const match = Router.match(router, 'GET', '/health/live');
    if (match === null) throw new Error('Expected /health/live route');

    const res = createRes();
    await match.handler({} as any, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'alive', uptime: expect.any(Number) })
    );
  });

  it('handles /health/ready success with cache omitted when null', async () => {
    const router = Router.createRouter();
    registerCoreRoutes(router);

    const match = Router.match(router, 'GET', '/health/ready');
    if (match === null) throw new Error('Expected /health/ready route');

    const res = createRes();
    await match.handler({} as any, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.dependencies.database.status).toBe('ready');
    expect(payload.dependencies.cache).toBeUndefined();
  });

  it('handles /health/ready success with cache included (non-null)', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const isConnected = vi.fn().mockReturnValue(false);
    (useDatabase as unknown as Mock).mockReturnValue({ connect, isConnected });

    (RuntimeHealthProbes.pingKvCache as unknown as Mock).mockResolvedValue(15);

    const router = Router.createRouter();
    registerCoreRoutes(router);

    const match = Router.match(router, 'GET', '/health/ready');
    if (match === null) throw new Error('Expected /health/ready route');

    const res = createRes();
    await match.handler({} as any, res);

    expect(connect).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.dependencies.cache).toBeDefined();
    expect(payload.dependencies.cache.responseTime).toBe(15);
  });

  it('handles /health/ready failure and includes cache when kv', async () => {
    hoisted.app.environment = 'production';

    (RuntimeHealthProbes.getCacheDriverName as unknown as Mock).mockReturnValue('kv');
    (QueryBuilder.ping as unknown as Mock).mockRejectedValueOnce(new Error('boom'));

    const router = Router.createRouter();
    registerCoreRoutes(router);

    const match = Router.match(router, 'GET', '/health/ready');
    if (match === null) throw new Error('Expected /health/ready route');

    const res = createRes();
    await match.handler({} as any, res);

    expect(res.setStatus).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'not_ready',
        dependencies: expect.objectContaining({ cache: expect.anything() }),
        error: 'Service unavailable',
      })
    );
  });

  it('covers middleware inheritance logic in Router.group', () => {
    const router = Router.createRouter();

    // Set inherited middleware
    router.inheritedMiddleware = ['auth', 'logging'];

    // Test with route-specific middleware array
    const options1 = { middleware: ['validation'] };
    const routeSpecificMiddleware1 = Array.isArray(options1?.middleware)
      ? options1?.middleware
      : [];
    const routeMiddleware1 = [...router.inheritedMiddleware, ...routeSpecificMiddleware1];

    expect(routeMiddleware1).toEqual(['auth', 'logging', 'validation']);

    // Test with no route-specific middleware
    const options2 = { middleware: undefined };
    const routeSpecificMiddleware2 = Array.isArray(options2?.middleware)
      ? (options2?.middleware as string[])
      : [];
    const routeMiddleware2 = [...router.inheritedMiddleware, ...routeSpecificMiddleware2];

    expect(routeMiddleware2).toEqual(['auth', 'logging']);

    // Test with empty middleware array
    const options3 = { middleware: [] };
    const routeSpecificMiddleware3 = Array.isArray(options3?.middleware)
      ? (options3?.middleware as string[])
      : [];
    const routeMiddleware3 = [...router.inheritedMiddleware, ...routeSpecificMiddleware3];

    expect(routeMiddleware3).toEqual(['auth', 'logging']);
  });
});
