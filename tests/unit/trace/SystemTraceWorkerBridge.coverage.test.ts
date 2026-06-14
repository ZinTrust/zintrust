/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GLOBAL_KEY = '__zintrust_worker_trace_bridge__';

type WorkerTraceModule = {
  emitCache?: (...args: unknown[]) => void;
  emitEvent?: (...args: unknown[]) => void;
  emitQuery?: (...args: unknown[]) => void;
};

describe('SystemTraceWorkerBridge (coverage)', () => {
  let original: unknown;

  beforeEach(() => {
    original = (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) {
      delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    } else {
      (globalThis as Record<string, unknown>)[GLOBAL_KEY] = original;
    }
  });

  it('is a no-op and never throws when no worker trace module is registered on globalThis', async () => {
    const { SystemTraceWorkerBridge } = await import('@/trace/SystemTraceWorkerBridge');

    expect(() => {
      SystemTraceWorkerBridge.emitCache('get', 'k:1', 3, true, { v: 1 }, 'mem', 60);
      SystemTraceWorkerBridge.emitEvent('user.created', 4, { id: 1 });
      SystemTraceWorkerBridge.emitQuery('select 1', [], 1, 'primary');
    }).not.toThrow();
  });

  it('forwards calls (with optional chaining) to a partial worker trace module', async () => {
    const emitCache = vi.fn();
    const emitQuery = vi.fn();

    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      emitCache,
      emitQuery,
      // emitEvent intentionally absent to exercise ?.
    } as WorkerTraceModule;

    const { SystemTraceWorkerBridge } = await import('@/trace/SystemTraceWorkerBridge');

    SystemTraceWorkerBridge.emitCache('set', 'users:42', 7, false, { name: 'x' }, 'redis', 300);
    SystemTraceWorkerBridge.emitEvent('order.paid', 0);
    SystemTraceWorkerBridge.emitQuery(
      'select * from orders where id = ?',
      [99],
      12,
      'replica',
      { servedByPrimary: false, servedByRegion: 'us-east' }
    );

    expect(emitCache).toHaveBeenCalledWith('set', 'users:42', 7, false, { name: 'x' }, 'redis', 300);
    expect(emitQuery).toHaveBeenCalledWith(
      'select * from orders where id = ?',
      [99],
      12,
      'replica',
      { servedByPrimary: false, servedByRegion: 'us-east' }
    );
  });

  it('swallows exceptions thrown by the injected worker trace module (best effort)', async () => {
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      emitCache: () => {
        throw new Error('trace module exploded');
      },
      emitEvent: vi.fn(),
      emitQuery: vi.fn(),
    } as WorkerTraceModule;

    const { SystemTraceWorkerBridge } = await import('@/trace/SystemTraceWorkerBridge');

    expect(() => SystemTraceWorkerBridge.emitCache('delete', 'tmp:1', 1)).not.toThrow();
    // other methods still present
    SystemTraceWorkerBridge.emitEvent('noop', 0);
  });
});
