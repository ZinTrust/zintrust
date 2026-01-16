import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@config/env', () => ({ Env: { NODE_ENV: 'production', get: vi.fn() } }));
vi.mock('@/config', () => ({ appConfig: { environment: 'production' } }));
vi.mock('@orm/Database', () => ({ useDatabase: vi.fn() }));
vi.mock('@orm/QueryBuilder', () => ({ QueryBuilder: { ping: vi.fn() } }));
vi.mock('@/health/RuntimeHealthProbes', () => ({
  RuntimeHealthProbes: {
    check: vi.fn(),
    getCacheDriverName: vi.fn(() => 'memory'),
  },
}));

const makeReqRes = () => {
  const calls: any = {};
  const res: any = {
    _calls: calls,
    setStatus(s: number) {
      calls.status = s;
      return res;
    },
    json(p: any) {
      calls.payload = p;
    },
  };
  const req: any = {};
  return { req, res, calls };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage: health routes', () => {
  it('/health: handles database error in production', async () => {
    const { useDatabase } = await import('@orm/Database');
    const { QueryBuilder } = await import('@orm/QueryBuilder');
    const { Logger } = await import('@config/logger');

    vi.mocked(useDatabase as any).mockReturnValue({});
    vi.mocked(QueryBuilder.ping as any).mockRejectedValue(new Error('db error'));

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerHealthRoutes } = await import('@/../routes/health');
    registerHealthRoutes(router);

    const { req, res } = makeReqRes();
    await router.routes[0].handler(req, res);

    expect(res._calls.status).toBe(503);
    expect(res._calls.payload).toEqual(
      expect.objectContaining({ status: 'unhealthy', error: 'Service unavailable' })
    );
    expect(vi.mocked(Logger.error as any)).toHaveBeenCalled();
  });

  it('/health: connects if not connected', async () => {
    const { useDatabase } = await import('@orm/Database');
    const { QueryBuilder } = await import('@orm/QueryBuilder');

    const mockConnect = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useDatabase as any).mockReturnValue({
      isConnected: () => false,
      connect: mockConnect,
    });
    vi.mocked(QueryBuilder.ping as any).mockResolvedValue(undefined);

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerHealthRoutes } = await import('@/../routes/health');
    registerHealthRoutes(router);

    const { req, res } = makeReqRes();
    await router.routes[0].handler(req, res);

    expect(mockConnect).toHaveBeenCalled();
    expect(res._calls.payload).toEqual(expect.objectContaining({ status: 'healthy' }));
  });

  it('/health/ready: handles probe failures', async () => {
    const { RuntimeHealthProbes } = await import('@/health/RuntimeHealthProbes');
    const { useDatabase } = await import('@orm/Database');
    const { QueryBuilder } = await import('@orm/QueryBuilder');

    vi.mocked(useDatabase as any).mockReturnValue({});
    vi.mocked(QueryBuilder.ping as any).mockResolvedValue(undefined);
    vi.mocked((RuntimeHealthProbes as any).check as any).mockResolvedValue([
      { name: 'cache', status: 'fail', message: 'Cache down' },
    ]);

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerHealthRoutes } = await import('@routes/health');
    registerHealthRoutes(router);

    const { req, res } = makeReqRes();
    await router.routes[2].handler(req, res);

    expect(res._calls.status).toBe(503);
    expect(res._calls.payload).toEqual(expect.objectContaining({ status: 'not_ready' }));
  });
});
