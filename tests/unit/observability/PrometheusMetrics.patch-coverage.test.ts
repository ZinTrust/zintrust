import { describe, expect, it, vi } from 'vitest';

describe('PrometheusMetrics patch coverage', () => {
  it('falls back to a no-op state when prom-client import fails', async () => {
    vi.resetModules();

    vi.doMock('prom-client', () => {
      throw new Error('prom-client unavailable');
    });

    const { PrometheusMetrics } = await import('@/observability/PrometheusMetrics');

    const out = await PrometheusMetrics.getMetricsText();
    expect(out.contentType).toContain('text/plain');
    expect(out.body).toBe('');

    await expect(
      PrometheusMetrics.observeHttpRequest({ method: '', route: '', status: NaN, durationMs: -5 })
    ).resolves.toBeUndefined();

    await expect(
      PrometheusMetrics.observeDbQuery({ driver: '', durationMs: -1 })
    ).resolves.toBeUndefined();
  });

  it('uses prom-client when available and normalizes labels', async () => {
    vi.resetModules();

    const registrySetDefaultLabels = vi.fn();
    const registryMetrics = vi.fn(async () => 'metrics');

    const counterInc = vi.fn();
    const histogramObserve = vi.fn();

    vi.doMock('@config/env', () => ({
      Env: {
        get: (key: string, defaultValue: string) => {
          if (key === 'APP_NAME') return 'ZinTrust';
          return defaultValue;
        },
      },
    }));

    vi.doMock('prom-client', () => {
      class Registry {
        public contentType = 'custom/type';
        public setDefaultLabels = registrySetDefaultLabels;
        public metrics = registryMetrics;
      }

      class Counter {
        public inc = counterInc;
      }

      class Histogram {
        public observe = histogramObserve;
      }

      return {
        Registry,
        Counter,
        Histogram,
        collectDefaultMetrics: () => {
          throw new Error('ignore');
        },
      };
    });

    const { PrometheusMetrics } = await import('@/observability/PrometheusMetrics');

    const text = await PrometheusMetrics.getMetricsText();
    expect(text.contentType).toBe('custom/type');
    expect(text.body).toBe('metrics');

    await PrometheusMetrics.observeHttpRequest({
      method: '',
      route: '',
      status: NaN,
      durationMs: -5,
    });

    expect(counterInc).toHaveBeenCalledWith(
      { method: 'UNKNOWN', route: 'unknown', status: '0' },
      1
    );
    expect(histogramObserve).toHaveBeenCalledWith(
      { method: 'UNKNOWN', route: 'unknown', status: '0' },
      0
    );

    await PrometheusMetrics.observeDbQuery({ driver: '', durationMs: -1 });
    expect(counterInc).toHaveBeenCalledWith({ driver: 'unknown' }, 1);
    expect(histogramObserve).toHaveBeenCalledWith({ driver: 'unknown' }, 0);

    expect(registrySetDefaultLabels).toHaveBeenCalledWith({ app: 'ZinTrust' });
  });
});
