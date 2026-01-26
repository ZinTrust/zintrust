import { Env } from '@config/env';
import { registerMetricsRoutes } from '@routes/metrics';
import { Router } from '@routing/Router';
import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    getBool: vi.fn(),
    get: vi.fn(),
  },
}));

const mocked = vi.hoisted(() => ({
  getMetricsText: vi.fn(async () => ({
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    body: 'metric 1\n',
  })),
}));

vi.mock('@/observability/PrometheusMetrics', () => ({
  PrometheusMetrics: {
    getMetricsText: mocked.getMetricsText,
  },
}));

describe('routes/metrics', () => {
  it('does not register /metrics when disabled', () => {
    (Env.getBool as unknown as Mock).mockReturnValue(false);

    const router = Router.createRouter();
    registerMetricsRoutes(router);

    expect(Router.match(router, 'GET', '/metrics')).toBeNull();
  });

  it('registers /metrics and serves content when enabled', async () => {
    (Env.getBool as unknown as Mock).mockReturnValue(true);
    (Env.get as unknown as Mock).mockImplementation(
      (_key: string, defaultVal?: string) => defaultVal ?? ''
    );

    const router = Router.createRouter();
    registerMetricsRoutes(router);

    const match = Router.match(router, 'GET', '/metrics');
    expect(match).not.toBeNull();

    const res = {
      setHeader: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await (match as any).handler({} as any, res as any);

    expect(mocked.getMetricsText).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8'
    );
    expect(res.send).toHaveBeenCalledWith('metric 1\n');
  });

  it('honors METRICS_PATH', () => {
    (Env.getBool as unknown as Mock).mockReturnValue(true);
    (Env.get as unknown as Mock).mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'METRICS_PATH') return '/internal/metrics';
      return defaultVal ?? '';
    });

    const router = Router.createRouter();
    registerMetricsRoutes(router);

    expect(Router.match(router, 'GET', '/internal/metrics')).not.toBeNull();
    expect(Router.match(router, 'GET', '/metrics')).toBeNull();
  });
});
