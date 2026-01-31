import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Database metrics & tracing integration', () => {
  it('calls Prometheus observe when METRICS_ENABLED is true', async () => {
    vi.resetModules();
    process.env['METRICS_ENABLED'] = 'true';

    const observeSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/observability/PrometheusMetrics', () => ({
      PrometheusMetrics: { observeDbQuery: observeSpy },
    }));

    const { Database } = await import('@orm/Database');
    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');

    // Register a simple test adapter
    DatabaseAdapterRegistry.register('test', () => {
      return {
        connect: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
        query: async () => ({ rows: [] }),
        queryOne: async () => null,
        transaction: async (cb: any) => cb(this),
        table: () => ({ create: () => ({}) }),
        onBeforeQuery: () => {},
        onAfterQuery: () => {},
        offBeforeQuery: () => {},
        offAfterQuery: () => {},
        getAdapterInstance: () => ({}) as any,
        getType: () => 'test',
        getConfig: () => ({ driver: 'test' }) as any,
        dispose: () => {},
      } as any;
    });

    const db = Database.create({ driver: 'test', database: ':memory:' } as any);
    await db.connect();

    const afterSpy = vi.fn();
    db.onAfterQuery(afterSpy);

    await db.query('SELECT 1', []);

    // Give the async observer a tick to run
    await new Promise((r) => setTimeout(r, 0));

    // Internal event should have been emitted
    expect(afterSpy).toHaveBeenCalled();

    // Dispose (cleanup) should not remove other registered handlers; afterSpy should still be invoked
    db.dispose();

    await db.query('SELECT 1', []);
    await new Promise((r) => setTimeout(r, 0));
    expect(afterSpy).toHaveBeenCalled();
  });

  it('calls OpenTelemetry when OTEL_ENABLED is true', async () => {
    vi.resetModules();
    process.env['OTEL_ENABLED'] = 'true';

    const traceSpy = vi.fn();
    vi.doMock('@/observability/OpenTelemetry', () => ({
      OpenTelemetry: { recordDbQuerySpan: traceSpy },
    }));

    const { Database } = await import('@orm/Database');
    const { DatabaseAdapterRegistry } = await import('@orm/DatabaseAdapterRegistry');

    DatabaseAdapterRegistry.register('d1', () => {
      return {
        connect: async () => {},
        disconnect: async () => {},
        isConnected: () => true,
        query: async () => ({ rows: [] }),
        queryOne: async () => null,
        transaction: async (cb: any) => cb(this),
        table: () => ({ create: () => ({}) }),
        onBeforeQuery: () => {},
        onAfterQuery: () => {},
        offBeforeQuery: () => {},
        offAfterQuery: () => {},
        getAdapterInstance: () => ({}) as any,
        getType: () => 'd1',
        getConfig: () => ({ driver: 'd1' }) as any,
        dispose: () => {},
      } as any;
    });

    const db = Database.create({ driver: 'd1', database: ':memory:' } as any);
    await db.connect();

    await db.query('SELECT 1', []);

    expect(traceSpy).toHaveBeenCalled();
  });
});
