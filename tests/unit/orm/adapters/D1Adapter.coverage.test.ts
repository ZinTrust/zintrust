import { beforeEach, describe, expect, it, vi } from 'vitest';

const getD1BindingMock = vi.fn();
vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getD1Binding: (...args: unknown[]) => getD1BindingMock(...args),
  },
}));

const rawQueryEnabledMock = vi.fn();
vi.mock('@config/features', () => ({
  FeatureFlags: {
    isRawQueryEnabled: () => rawQueryEnabledMock(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    withTraceSkipContext: (context?: Record<string, unknown>) => ({
      ...(context ?? {}),
      __zintrustSkipTraceLog: true,
    }),
  },
}));

import { D1Adapter } from '@orm/adapters/D1Adapter';
import { normalizeParams } from '@proxy/d1/ZintrustD1Proxy';
import { csvEnvSet, filterDrainTargetsByEnv, resolveDrainTargets } from '@worker-runtime/drain';

describe('D1Adapter (coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getD1BindingMock.mockReset();
    rawQueryEnabledMock.mockReset();
    rawQueryEnabledMock.mockReturnValue(true);
  });

  it('throws when not connected and when binding missing', async () => {
    const adapter = D1Adapter.create({} as any);
    await expect(adapter.query('select 1', [])).rejects.toBeDefined();

    await adapter.connect();
    getD1BindingMock.mockReturnValue(null);
    await expect(adapter.query('select 1', [])).rejects.toBeDefined();
  });

  it('handles mutating and non-mutating queries and extracts meta from multiple fields', async () => {
    const runMock = vi.fn(async () => ({ meta: { rows_written: 3, last_insert_rowid: 9 } }));
    const allMock = vi.fn(async () => ({ results: [{ a: 1 }], meta: { rows_read: 1 } }));
    const firstMock = vi.fn(async () => ({ a: 1 }));

    const bindMock = vi.fn(() => ({ run: runMock, all: allMock, first: firstMock }));
    const prepare = vi.fn(() => ({ bind: bindMock }));

    getD1BindingMock.mockReturnValue({ prepare });

    const adapter = D1Adapter.create({} as any);
    await adapter.connect();

    const mut = await adapter.query('insert into t values (1)', []);
    expect(mut.rowCount).toBe(3);
    expect(mut.lastInsertId).toBe(9);

    const q = await adapter.query('select * from t', []);
    expect(q.rows).toEqual([{ a: 1 }]);
    expect(q.rowCount).toBe(1);

    const one = await adapter.queryOne('select 1', []);
    expect(one).toEqual({ a: 1 });

    await expect(adapter.ping()).resolves.toBeUndefined();
  });

  it('extractMeta falls back to changes=0 when meta has no recognized fields', async () => {
    const runMock = vi.fn(async () => ({ meta: {} }));
    const bindMock = vi.fn(() => ({ run: runMock }));
    const prepare = vi.fn(() => ({ bind: bindMock }));
    getD1BindingMock.mockReturnValue({ prepare });

    const adapter = D1Adapter.create({} as any);
    await adapter.connect();

    const out = await adapter.query('update t set a=1', []);
    expect(out.rowCount).toBe(0);
  });

  it('rawQuery enforces feature flag and returns results array', async () => {
    const allMock = vi.fn(async () => ({ results: [{ x: 1 }] }));
    const bindMock = vi.fn(() => ({ all: allMock }));
    const prepare = vi.fn(() => ({ bind: bindMock }));
    getD1BindingMock.mockReturnValue({ prepare });

    const adapter = D1Adapter.create({} as any);
    await adapter.connect();

    rawQueryEnabledMock.mockReturnValue(false);
    await expect(adapter.rawQuery('select 1', [])).rejects.toBeDefined();

    rawQueryEnabledMock.mockReturnValue(true);
    const out = await adapter.rawQuery<{ x: number }>('select 1', []);
    expect(out).toEqual([{ x: 1 }]);

    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('normalizes integer bind params to decimal strings (for TEXT affinity compatibility) while leaving floats/other types unchanged', async () => {
    const allMock = vi.fn(async () => ({ results: [{ ok: 1 }] }));
    const bindMock = vi.fn(() => ({ all: allMock }));
    const prepare = vi.fn(() => ({ bind: bindMock }));
    getD1BindingMock.mockReturnValue({ prepare });

    const adapter = D1Adapter.create({} as any);
    await adapter.connect();

    // integer -> becomes string '42'
    await adapter.query('select * from t where id = ?', [42]);
    expect(bindMock).toHaveBeenCalledWith('42');

    // float stays number, string stays; covers the map 'else' path too
    await adapter.query('select * from t where v = ? and s = ?', [3.14, 'foo']);
    expect(bindMock).toHaveBeenCalledWith(3.14, 'foo');

    // queryOne path with integer also exercises normalize
    const firstMock = vi.fn(async () => ({ v: 1 }));
    bindMock.mockReturnValueOnce({ first: firstMock });
    await adapter.queryOne('select v from t where id=?', [7]);
    expect(firstMock).toHaveBeenCalled();

    // rawQuery path with integer
    rawQueryEnabledMock.mockReturnValue(true);
    const allForRaw = vi.fn(async () => ({ results: [] }));
    bindMock.mockReturnValueOnce({ all: allForRaw });
    await adapter.rawQuery('select 1', [123]);
    expect(allForRaw).toHaveBeenCalled();

    // cover new normalization for Date and plain objects (JSON.stringify path)
    const d = new Date('2026-06-13T12:00:00.000Z');
    await adapter.query('select * from t where ts=?', [d]);
    expect(bindMock).toHaveBeenCalledWith(d.toISOString());

    const obj = { nested: { a: 1 }, arr: [true] };
    await adapter.query('select * from t where data=?', [obj]);
    expect(bindMock).toHaveBeenCalledWith(JSON.stringify(obj));
  });

  it('exercises normalizeParams (from D1 proxy) for Date and objects', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(normalizeParams([d, { a: 1 }])).toEqual([d.toISOString(), JSON.stringify({ a: 1 })]);
    expect(normalizeParams([42])).toEqual(['42']);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(normalizeParams([3.14, 'plain', null, false, bytes])).toEqual([
      3.14,
      'plain',
      null,
      false,
      bytes,
    ]);
  });

  it('exercises drain env filter helpers and resolver return for patch coverage', async () => {
    const targets = [
      { queueName: 'q1', processorSpec: 'p' },
      { queueName: 'q2', processorSpec: 'p' },
    ];
    // default (no env) keeps all
    expect(filterDrainTargetsByEnv(targets)).toHaveLength(2);

    // with onlyQueues
    process.env.WORKER_DRAIN_QUEUES = 'q1';
    expect(filterDrainTargetsByEnv(targets).map((t) => t.queueName)).toEqual(['q1']);
    delete process.env.WORKER_DRAIN_QUEUES;

    // with exclude
    process.env.WORKER_DRAIN_EXCLUDE_QUEUES = 'q2';
    expect(filterDrainTargetsByEnv(targets).map((t) => t.queueName)).toEqual(['q1']);
    delete process.env.WORKER_DRAIN_EXCLUDE_QUEUES;

    // csvEnvSet direct
    process.env.FOO_CSV = ' a , b ';
    expect(csvEnvSet('FOO_CSV')).toEqual(new Set(['a', 'b']));
    delete process.env.FOO_CSV;

    const modules = [{ workerDefinition: { processorSpec: 'p' }, default: async () => undefined }];
    await expect(
      resolveDrainTargets(
        [
          {
            name: 'worker',
            queueName: 'q1',
            version: '1',
            autoStart: true,
            activeStatus: true,
            concurrency: 1,
            processorSpec: 'p',
          },
        ],
        modules as any
      )
    ).resolves.toEqual([{ queueName: 'q1', processorSpec: 'p' }]);
  });
});
