/* eslint-disable no-await-in-loop, no-nested-ternary -- deterministic sequential assertions in table-driven tests */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  const qb = {
    max: vi.fn(() => qb),
    select: vi.fn(() => qb),
    selectAs: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    orderBy: vi.fn(() => qb),
    first: vi.fn(async () => null as unknown),
    get: vi.fn(async () => [] as unknown[]),
    update: vi.fn(async () => undefined),
    insert: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  return {
    qb,
    create: vi.fn(() => qb),
    env: {} as Record<string, unknown>,
  };
});

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: { create: (...args: unknown[]) => (mocked.create as (...a: any[]) => any)(...args) },
}));

vi.mock('@config/env', () => ({
  Env: {
    getBool: (key: string, fallback = false) => mocked.env[key] ?? fallback,
    get: (key: string, fallback = '') => mocked.env[key] ?? fallback,
  },
}));

type LegacyDb = {
  driver: string;
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  ensure: ReturnType<typeof vi.fn>;
  adapterConnect?: ReturnType<typeof vi.fn>;
};

const makeDb = (
  driver: string,
  options: {
    columns?: string[];
    tableExists?: boolean;
    queryRows?: (sql: string, params: unknown[]) => unknown[];
    queryFn?: boolean;
    adapter?: 'ensure' | 'connect' | 'none';
  } = {}
): LegacyDb & Record<string, unknown> => {
  const columns = options.columns ?? [
    'name',
    'batch',
    'status',
    'scope',
    'service',
    'applied_at',
    'created_at',
  ];
  const columnSet = new Set(columns);
  const ensure = vi.fn(async () => undefined);
  const adapterConnect = vi.fn(async () => undefined);
  const adapter =
    options.adapter === 'none'
      ? {}
      : options.adapter === 'connect'
        ? { connect: adapterConnect, ensureMigrationsTable: ensure }
        : { ensureMigrationsTable: ensure };

  const db: LegacyDb & Record<string, unknown> = {
    driver,
    ensure,
    adapterConnect,
    getType: () => driver,
    getAdapterInstance: () => adapter,
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('PRAGMA table_info')) {
        return columns.map((name) => ({ name }));
      }
      if (sql.includes('information_schema.columns') || sql.includes('sys.columns')) {
        const column = String(params[1] ?? '');
        return columnSet.has(column) ? [{ ok: 1 }] : [];
      }
      if (sql.includes('information_schema.tables') || sql.includes('sqlite_master') || sql.includes('sys.tables')) {
        return options.tableExists === false ? [] : [{ ok: 1 }];
      }
      return options.queryRows?.(sql, params) ?? [];
    }),
    execute: vi.fn(async () => ({ rows: [], rowCount: 1 })),
  };

  if (options.queryFn === false) {
    delete db.query;
  }
  return db;
};

const loadStore = async () => (await import('@orm/migrations/MigrationStore')).MigrationStore;

describe('MigrationStore remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.env = {};
    mocked.create.mockReturnValue(mocked.qb);
    mocked.qb.first.mockReset();
    mocked.qb.first.mockResolvedValue(null);
    mocked.qb.get.mockReset();
    mocked.qb.get.mockResolvedValue([]);
  });

  it('builds legacy identity conditions for every column combination', async () => {
    const MigrationStore = await loadStore();
    const combinations: Array<[string[], string[]]> = [
      [
        ['name', 'migration', 'batch', 'scope', 'service'],
        ['(name = ? OR migration = ?)', 'scope = ?', 'service = ?'],
      ],
      [['name', 'batch'], ['name = ?']],
      [['migration', 'batch'], ['migration = ?']],
      [['name', 'batch', 'service'], ['name = ?', 'service = ?']],
    ];

    for (const [columns, fragments] of combinations) {
      const db = makeDb('sqlite', { columns });
      await MigrationStore.insertRunning(db as never, {
        name: '001_create',
        scope: 'global',
        service: '',
        batch: 1,
      });
      const identitySql = db.query.mock.calls
        .map((call) => String(call[0]))
        .find((sql) => sql.startsWith('SELECT id FROM migrations WHERE'));
      expect(identitySql).toBeDefined();
      for (const fragment of fragments) expect(identitySql).toContain(fragment);
      expect(String(db.execute.mock.calls[0]?.[0])).toContain('INSERT INTO migrations');
    }
  });

  it('updates an existing legacy record with and without applied_at support', async () => {
    const MigrationStore = await loadStore();

    const withAppliedAt = makeDb('sqlite', {
      columns: ['name', 'batch', 'scope', 'service', 'applied_at'],
      queryRows: () => [{ id: 1 }],
    });
    await MigrationStore.insertRunning(withAppliedAt as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      batch: 2,
    });
    const updateSql = String(withAppliedAt.execute.mock.calls[0]?.[0]);
    expect(updateSql).toContain('UPDATE migrations SET batch = ?, applied_at = ?');
    expect(withAppliedAt.execute.mock.calls[0]?.[1]).toEqual([
      2,
      null,
      '001_create',
      'global',
      '',
    ]);

    const withoutAppliedAt = makeDb('sqlite', {
      columns: ['migration', 'batch'],
      queryRows: () => [{ id: 1 }],
    });
    await MigrationStore.insertRunning(withoutAppliedAt as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      batch: 3,
    });
    expect(String(withoutAppliedAt.execute.mock.calls[0]?.[0])).toBe(
      'UPDATE migrations SET batch = ? WHERE migration = ?'
    );
  });

  it('computes the max legacy batch and normalizes legacy rows', async () => {
    const MigrationStore = await loadStore();
    const db = makeDb('sqlite', {
      columns: ['migration', 'batch', 'applied_at'],
      queryRows: (sql) =>
        sql.startsWith('SELECT migration, batch')
          ? [
              { migration: 'b', batch: '4', applied_at: '2024-01-01' },
              { migration: 'a', batch: 2, applied_at: null },
              { migration: 'skipped', batch: 9, status: 'running' },
              { migration: 'c', batch: Number.NaN },
            ]
          : [],
    });

    await expect(
      MigrationStore.getLastCompletedBatch(db as never, 'global', null as never)
    ).resolves.toBe(9);

    const map = await MigrationStore.getAppliedMap(db as never, 'global', '');
    expect(map.get('b')).toMatchObject({ name: 'b', batch: 4, status: 'completed', appliedAt: '2024-01-01' });
    expect(map.get('a')).toMatchObject({ scope: 'global', service: '', appliedAt: null });
    expect(map.has('')).toBe(false);

    mockQbGet([{ name: 'x', batch: 7, service: null }]);
    const modernMap = await MigrationStore.getAppliedMap(makeDb('sqlite') as never, 'global', '');
    expect(modernMap.get('x')).toMatchObject({ service: '' });
  });

  it('handles legacy markStatus branches including delete and no-op', async () => {
    const MigrationStore = await loadStore();
    const noStatus = makeDb('sqlite', { columns: ['name', 'batch'] });
    await MigrationStore.markStatus(noStatus as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      status: 'failed',
    });
    expect(String(noStatus.execute.mock.calls[0]?.[0])).toContain('DELETE FROM migrations');

    const onlyStatus = makeDb('sqlite', { columns: ['name', 'batch', 'status'] });
    await MigrationStore.markStatus(onlyStatus as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      status: 'completed',
    });
    expect(String(onlyStatus.execute.mock.calls[0]?.[0])).toBe(
      'UPDATE migrations SET status = ? WHERE name = ?'
    );

    const noAssignments = makeDb('sqlite', { columns: ['name', 'batch'] });
    await MigrationStore.markStatus(noAssignments as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      status: 'completed',
    });
    expect(noAssignments.execute).not.toHaveBeenCalled();

    const withAppliedAt = makeDb('sqlite', {
      columns: ['name', 'batch', 'status', 'applied_at'],
    });
    await MigrationStore.markStatus(withAppliedAt as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      status: 'completed',
      appliedAt: '2024-02-02',
    });
    expect(String(withAppliedAt.execute.mock.calls[0]?.[0])).toContain('applied_at = ?');
    expect(withAppliedAt.execute.mock.calls[0]?.[1]).toContain('2024-02-02');
  });

  it('updates modern records with and without appliedAt', async () => {
    const MigrationStore = await loadStore();
    const db = makeDb('postgresql');

    await MigrationStore.markStatus(db as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      status: 'completed',
      appliedAt: '2024-03-03',
    });
    expect(mocked.qb.update).toHaveBeenCalledWith({
      status: 'completed',
      applied_at: '2024-03-03',
    });

    await MigrationStore.markStatus(db as never, {
      name: '001_create',
      scope: 'global',
      service: '',
      status: 'failed',
    });
    expect(mocked.qb.update).toHaveBeenLastCalledWith({ status: 'failed' });
  });

  it('updates existing modern running records and inserts new ones', async () => {
    const MigrationStore = await loadStore();

    mocked.qb.first.mockResolvedValueOnce({ id: 9 });
    await MigrationStore.insertRunning(makeDb('mysql') as never, {
      name: '001_create',
      scope: 'global',
      service: null as never,
      batch: 2,
    });
    expect(mocked.qb.update).toHaveBeenCalledWith({
      batch: 2,
      status: 'running',
      applied_at: null,
    });
    expect(mocked.qb.insert).not.toHaveBeenCalled();

    await MigrationStore.insertRunning(makeDb('mysql') as never, {
      name: '002_create',
      scope: 'tenant',
      service: 'api',
      batch: 3,
    });
    expect(mocked.qb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: '002_create', service: 'api', status: 'running' })
    );
  });

  it('lists and deletes records in both modern and legacy layouts', async () => {
    const MigrationStore = await loadStore();

    const legacyRows = [
      { migration: 'b', batch: '2' },
      { migration: 'a', batch: 2 },
      { migration: 'z', batch: 3 },
      { migration: 'skip', batch: 0 },
    ];
    const legacyDb = makeDb('sqlite', {
      columns: ['migration', 'batch'],
      queryRows: (sql) => (sql.startsWith('SELECT migration, batch') ? legacyRows : []),
    });
    await expect(
      MigrationStore.listCompletedInBatchesGte(legacyDb as never, {
        scope: 'global',
        service: '',
        minBatch: 2,
      })
    ).resolves.toEqual([
      { name: 'z', batch: 3 },
      { name: 'b', batch: 2 },
      { name: 'a', batch: 2 },
    ]);
    await expect(
      MigrationStore.listAllCompletedNames(legacyDb as never, { scope: 'global', service: '' })
    ).resolves.toEqual(['z', 'skip', 'b', 'a']);
    await MigrationStore.deleteRecord(legacyDb as never, {
      name: 'a',
      scope: 'global',
      service: '',
    });
    expect(String(legacyDb.execute.mock.calls.at(-1)?.[0])).toContain('DELETE FROM migrations');

    mockQbGet([{ name: 'modern', batch: 5 }, { name: '', batch: 6 }, { batch: 7 }]);
    await expect(
      MigrationStore.listCompletedInBatchesGte(makeDb('sqlite') as never, {
        scope: 'global',
        service: '',
        minBatch: 1,
      })
    ).resolves.toEqual([{ name: 'modern', batch: 5 }]);

    mockQbGet([{ name: 'one' }, { name: '' }, {}]);
    await expect(
      MigrationStore.listAllCompletedNames(makeDb('sqlite') as never, {
        scope: 'global',
        service: '',
      })
    ).resolves.toEqual(['one']);
    await MigrationStore.deleteRecord(makeDb('sqlite') as never, {
      name: 'one',
      scope: 'global',
      service: '',
    });
    expect(mocked.qb.delete).toHaveBeenCalled();
  });

  it('falls back to default layout, probes other drivers, and reports proxy hints', async () => {
    const MigrationStore = await loadStore();

    mocked.qb.first.mockResolvedValueOnce('5');
    await expect(
      MigrationStore.getLastCompletedBatch(makeDb('sqlite', { queryFn: false }) as never)
    ).resolves.toBe(0);

    for (const driver of ['postgresql', 'mysql', 'sqlserver']) {
      const db = makeDb(driver, { columns: ['name', 'batch', 'status', 'scope', 'service'] });
      await expect(MigrationStore.getLastCompletedBatch(db as never)).resolves.toBe(0);
      expect(db.query).toHaveBeenCalled();
    }
    await expect(
      MigrationStore.getLastCompletedBatch(makeDb('oracle') as never)
    ).rejects.toThrow(/Unsupported DB driver/);

    mocked.env['POSTGRES_PROXY_URL'] = 'http://proxy';
    await expect(MigrationStore.ensureTable(makeDb('sqlite', { adapter: 'none' }) as never)).rejects.toThrow(
      /proxy stack is running/
    );
    await expect(MigrationStore.ensureTable(makeDb('d1', { adapter: 'none' }) as never)).rejects.toThrow(
      /configured for D1/
    );

    const withAdapterConnect = makeDb('sqlite', { adapter: 'connect' });
    await MigrationStore.ensureTable(withAdapterConnect as never);
    expect(withAdapterConnect.adapterConnect).toHaveBeenCalled();

    const cacheDb = makeDb('sqlite');
    mocked.qb.first.mockRejectedValueOnce(new Error('boom'));
    await expect(MigrationStore.getLastCompletedBatch(cacheDb as never)).rejects.toThrow();
    mocked.qb.first.mockResolvedValueOnce({ max_batch: 2 });
    await expect(MigrationStore.getLastCompletedBatch(cacheDb as never)).resolves.toBe(2);
  });
});

function mockQbGet(rows: unknown[]) {
  mocked.qb.get.mockResolvedValueOnce(rows);
}
