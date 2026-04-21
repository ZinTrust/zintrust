import { Env } from '@config/env';
import { useDatabase } from '@orm/Database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_: string, defaultValue?: string) => defaultValue ?? ''),
  },
}));

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(),
}));

vi.mock('@common/utility', async () => {
  const actual = await vi.importActual<typeof import('@common/utility')>('@common/utility');
  return {
    ...actual,
    generateUuid: vi.fn(() => 'bulletproof-uuid'),
  };
});

import { BulletproofDeviceStore } from '@security/BulletproofDeviceStore';

type QueryStub = {
  where: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

type TransactionDatabaseStub = {
  table: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

const createQueryStub = (): QueryStub => {
  const query = {
    where: vi.fn(),
    first: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  query.where.mockReturnValue(query);
  return query;
};

const createTransactionDatabaseStub = (
  query: QueryStub,
  execute: ReturnType<typeof vi.fn>
): TransactionDatabaseStub => {
  return {
    table: vi.fn(() => query),
    execute,
  };
};

const createTransactionMock = (database: TransactionDatabaseStub): ReturnType<typeof vi.fn> => {
  return vi.fn(async (callback: (db: TransactionDatabaseStub) => Promise<unknown>) => {
    return callback(database);
  });
};

const createDatabaseStub = (
  query: QueryStub,
  options?: {
    execute?: ReturnType<typeof vi.fn>;
    transaction?: ReturnType<typeof vi.fn>;
    getType?: string;
  }
): ReturnType<typeof useDatabase> => {
  return {
    table: vi.fn(() => query),
    transaction: options?.transaction ?? vi.fn(),
    execute: options?.execute ?? vi.fn(),
    getType: vi.fn(() => options?.getType ?? 'sqlite'),
  } as never;
};

describe('BulletproofDeviceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Env.get).mockImplementation((_: string, defaultValue?: string) => defaultValue ?? '');
  });

  it('returns null for an empty device id without touching the database', async () => {
    await expect(BulletproofDeviceStore.findByDeviceId('   ')).resolves.toBeNull();
    expect(useDatabase).not.toHaveBeenCalled();
  });

  it('returns null when the device lookup does not find a matching row', async () => {
    const query = createQueryStub();
    query.first.mockResolvedValueOnce(null);

    vi.mocked(useDatabase).mockReturnValue(createDatabaseStub(query));

    await expect(BulletproofDeviceStore.findByDeviceId('dev-miss')).resolves.toBeNull();
  });

  it('normalizes stored rows and falls back to the default table when env table is blank', async () => {
    const query = createQueryStub();
    query.first.mockResolvedValue({
      user_id: ' user-1 ',
      device_id: ' dev-1 ',
      signing_secret: ' secret-1 ',
      user_agent: ' agent-1 ',
      last_seen_at: '2026-04-20T00:00:00.000Z',
      created_at: 1713561600000,
      updated_at: new Date('2026-04-20T01:00:00.000Z'),
    });

    vi.mocked(Env.get).mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'BULLETPROOF_DEVICE_DB_CONNECTION') return ' reporting ';
      if (key === 'BULLETPROOF_DEVICE_DB_TABLE') return '   ';
      return defaultValue ?? '';
    });

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
    } as never);

    await expect(BulletproofDeviceStore.findByDeviceId(' dev-1 ')).resolves.toEqual({
      userId: 'user-1',
      deviceId: 'dev-1',
      signingSecret: 'secret-1',
      userAgent: 'agent-1',
      lastSeenAt: new Date('2026-04-20T00:00:00.000Z'),
      createdAt: new Date(1713561600000),
      updatedAt: new Date('2026-04-20T01:00:00.000Z'),
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'reporting');
  });

  it('upserts records, normalizes optional fields, and inserts when the record is missing', async () => {
    const query = createQueryStub();
    query.update.mockResolvedValue(0);
    query.first.mockResolvedValueOnce({
      device_id: 'dev-2',
      signing_secret: 'secret-2',
      last_seen_at: '2026-04-20T02:00:00.000Z',
      created_at: '2026-04-20T02:00:00.000Z',
      updated_at: '2026-04-20T02:00:00.000Z',
    });
    const execute = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const transaction = createTransactionMock(createTransactionDatabaseStub(query, execute));

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
      transaction,
      execute,
      getType: vi.fn(() => 'sqlite'),
    } as never);

    const record = await BulletproofDeviceStore.upsert({
      userId: '   ',
      deviceId: ' dev-2 ',
      signingSecret: 'secret-2',
      userAgent: '   ',
      lastSeenAt: new Date('2026-04-20T02:00:00.000Z'),
    });

    expect(query.update).toHaveBeenCalledWith({
      user_id: null,
      signing_secret: 'secret-2',
      user_agent: null,
      last_seen_at: '2026-04-20T02:00:00.000Z',
      updated_at: '2026-04-20T02:00:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(
      'INSERT OR IGNORE INTO zintrust_bulletproof_devices (user_id, device_id, signing_secret, user_agent, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        null,
        'dev-2',
        'secret-2',
        null,
        '2026-04-20T02:00:00.000Z',
        '2026-04-20T02:00:00.000Z',
        '2026-04-20T02:00:00.000Z',
      ]
    );
    expect(record).toEqual({
      deviceId: 'dev-2',
      signingSecret: 'secret-2',
      lastSeenAt: new Date('2026-04-20T02:00:00.000Z'),
      createdAt: new Date('2026-04-20T02:00:00.000Z'),
      updatedAt: new Date('2026-04-20T02:00:00.000Z'),
    });
  });

  it.each([
    'duplicate key value violates unique constraint',
    'UNIQUE constraint failed: zintrust_bulletproof_devices.device_id',
    'insert ignored because unique failed',
    'duplicate device id',
  ])('tolerates duplicate insert races reported as %s', async (message) => {
    const query = createQueryStub();
    query.update.mockResolvedValue(0);
    query.first.mockResolvedValueOnce({
      device_id: 'dev-race',
      signing_secret: 'secret-race',
      last_seen_at: '2026-04-20T02:30:00.000Z',
      created_at: '2026-04-20T02:30:00.000Z',
      updated_at: '2026-04-20T02:30:00.000Z',
    });
    const execute = vi.fn().mockRejectedValueOnce(new Error(message));
    const transaction = createTransactionMock(createTransactionDatabaseStub(query, execute));

    vi.mocked(useDatabase).mockReturnValue(
      createDatabaseStub(query, { execute, transaction, getType: 'sqlite' })
    );

    await expect(
      BulletproofDeviceStore.upsert({
        deviceId: 'dev-race',
        signingSecret: 'secret-race',
        lastSeenAt: new Date('2026-04-20T02:30:00.000Z'),
      })
    ).resolves.toEqual({
      deviceId: 'dev-race',
      signingSecret: 'secret-race',
      lastSeenAt: new Date('2026-04-20T02:30:00.000Z'),
      createdAt: new Date('2026-04-20T02:30:00.000Z'),
      updatedAt: new Date('2026-04-20T02:30:00.000Z'),
    });
  });

  it('wraps non-duplicate insert races during upsert as database errors', async () => {
    const query = createQueryStub();
    query.update.mockResolvedValue(0);
    const execute = vi.fn().mockRejectedValueOnce(new Error('write blocked by policy'));
    const transaction = createTransactionMock(createTransactionDatabaseStub(query, execute));

    vi.mocked(useDatabase).mockReturnValue(
      createDatabaseStub(query, { execute, transaction, getType: 'sqlite' })
    );

    await expect(
      BulletproofDeviceStore.upsert({
        deviceId: 'dev-race',
        signingSecret: 'secret-race',
        lastSeenAt: new Date('2026-04-20T02:35:00.000Z'),
      })
    ).rejects.toHaveProperty('code', 'DATABASE_ERROR');
  });

  it('retries with a generated uuid id when the auth table requires explicit ids', async () => {
    const query = createQueryStub();
    query.update.mockResolvedValue(0);
    query.first.mockResolvedValueOnce({
      device_id: 'dev-uuid',
      signing_secret: 'secret-uuid',
      last_seen_at: '2026-04-20T02:35:00.000Z',
      created_at: '2026-04-20T02:35:00.000Z',
      updated_at: '2026-04-20T02:35:00.000Z',
    });
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('NOT NULL constraint failed: zintrust_bulletproof_devices.id')
      )
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const transaction = createTransactionMock(createTransactionDatabaseStub(query, execute));

    vi.mocked(useDatabase).mockReturnValue(
      createDatabaseStub(query, { execute, transaction, getType: 'sqlite' })
    );

    await expect(
      BulletproofDeviceStore.upsert({
        deviceId: 'dev-uuid',
        signingSecret: 'secret-uuid',
        lastSeenAt: new Date('2026-04-20T02:35:00.000Z'),
      })
    ).resolves.toEqual({
      deviceId: 'dev-uuid',
      signingSecret: 'secret-uuid',
      lastSeenAt: new Date('2026-04-20T02:35:00.000Z'),
      createdAt: new Date('2026-04-20T02:35:00.000Z'),
      updatedAt: new Date('2026-04-20T02:35:00.000Z'),
    });

    expect(execute).toHaveBeenNthCalledWith(
      2,
      'INSERT OR IGNORE INTO zintrust_bulletproof_devices (id, user_id, device_id, signing_secret, user_agent, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'bulletproof-uuid',
        null,
        'dev-uuid',
        'secret-uuid',
        null,
        '2026-04-20T02:35:00.000Z',
        '2026-04-20T02:35:00.000Z',
        '2026-04-20T02:35:00.000Z',
      ]
    );
  });

  it('validates required device store fields during upsert', async () => {
    await expect(
      BulletproofDeviceStore.upsert({
        deviceId: '   ',
        signingSecret: 'secret-required',
        lastSeenAt: new Date('2026-04-20T03:00:00.000Z'),
      })
    ).rejects.toHaveProperty('code', 'VALIDATION_ERROR');

    await expect(
      BulletproofDeviceStore.upsert({
        deviceId: 'dev-required',
        signingSecret: '   ',
        lastSeenAt: new Date('2026-04-20T03:00:00.000Z'),
      })
    ).rejects.toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it.each([
    [
      'mysql',
      'INSERT IGNORE INTO zintrust_bulletproof_devices (user_id, device_id, signing_secret, user_agent, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ],
    [
      'postgresql',
      'INSERT INTO zintrust_bulletproof_devices (user_id, device_id, signing_secret, user_agent, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (device_id) DO NOTHING',
    ],
    [
      'sqlserver',
      'MERGE INTO zintrust_bulletproof_devices WITH (HOLDLOCK) AS target USING (SELECT v1 AS user_id, v2 AS device_id, v3 AS signing_secret, v4 AS user_agent, v5 AS last_seen_at, v6 AS created_at, v7 AS updated_at FROM (SELECT ? AS v1, ? AS v2, ? AS v3, ? AS v4, ? AS v5, ? AS v6, ? AS v7) seed) AS source ON target.device_id = source.device_id WHEN NOT MATCHED THEN INSERT (user_id, device_id, signing_secret, user_agent, last_seen_at, created_at, updated_at) VALUES (source.user_id, source.device_id, source.signing_secret, source.user_agent, source.last_seen_at, source.created_at, source.updated_at);',
    ],
    [
      'oracle',
      'INSERT INTO zintrust_bulletproof_devices (user_id, device_id, signing_secret, user_agent, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ],
  ])('uses the expected insert-ignore SQL for %s drivers', async (driver, expectedSql) => {
    const query = createQueryStub();
    query.update.mockResolvedValue(0);
    query.first.mockResolvedValueOnce({
      device_id: 'dev-driver',
      signing_secret: 'secret-driver',
      last_seen_at: '2026-04-20T05:00:00.000Z',
      created_at: '2026-04-20T05:00:00.000Z',
      updated_at: '2026-04-20T05:00:00.000Z',
    });

    const execute = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const transaction = createTransactionMock(createTransactionDatabaseStub(query, execute));

    vi.mocked(useDatabase).mockReturnValue(
      createDatabaseStub(query, { execute, transaction, getType: String(driver) })
    );

    await BulletproofDeviceStore.upsert({
      deviceId: 'dev-driver',
      signingSecret: 'secret-driver',
      lastSeenAt: new Date('2026-04-20T05:00:00.000Z'),
    });

    expect(execute).toHaveBeenCalledWith(expectedSql, [
      null,
      'dev-driver',
      'secret-driver',
      null,
      '2026-04-20T05:00:00.000Z',
      '2026-04-20T05:00:00.000Z',
      '2026-04-20T05:00:00.000Z',
    ]);
  });

  it('wraps missing-table and invalid-record failures as config errors', async () => {
    const query = createQueryStub();
    query.first.mockRejectedValueOnce(new Error('missing column'));

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
      transaction: vi.fn(),
      execute: vi.fn(),
      getType: vi.fn(() => 'sqlite'),
    } as never);

    await expect(BulletproofDeviceStore.findByDeviceId('dev-3')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );

    query.first.mockResolvedValueOnce({ device_id: 'dev-4' });
    query.update.mockResolvedValue(1);
    const execute = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const transaction = createTransactionMock(createTransactionDatabaseStub(query, execute));

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
      transaction,
      execute,
      getType: vi.fn(() => 'sqlite'),
    } as never);

    await expect(
      BulletproofDeviceStore.upsert({
        deviceId: 'dev-4',
        signingSecret: 'secret-4',
        lastSeenAt: new Date('2026-04-20T04:00:00.000Z'),
      })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('treats malformed lookup rows as config errors', async () => {
    const query = createQueryStub();
    query.first.mockResolvedValueOnce({ device_id: 'dev-invalid' });

    vi.mocked(useDatabase).mockReturnValue(createDatabaseStub(query));

    await expect(BulletproofDeviceStore.findByDeviceId('dev-invalid')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('deletes stored records and wraps delete failures', async () => {
    const query = createQueryStub();
    query.delete.mockResolvedValue(undefined);

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
      transaction: vi.fn(),
      execute: vi.fn(),
      getType: vi.fn(() => 'sqlite'),
    } as never);

    await expect(BulletproofDeviceStore.removeByDeviceId(' dev-5 ')).resolves.toBeUndefined();
    expect(query.where).toHaveBeenCalledWith('device_id', '=', 'dev-5');

    query.delete.mockRejectedValueOnce(new Error('delete failed'));

    await expect(BulletproofDeviceStore.removeByDeviceId('dev-5')).rejects.toHaveProperty(
      'code',
      'DATABASE_ERROR'
    );
  });

  it('wraps non-schema lookup failures as database errors', async () => {
    const query = createQueryStub();
    query.first.mockRejectedValueOnce(new Error('permission denied'));

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
      transaction: vi.fn(),
      execute: vi.fn(),
      getType: vi.fn(() => 'sqlite'),
    } as never);

    await expect(BulletproofDeviceStore.findByDeviceId('dev-6')).rejects.toHaveProperty(
      'code',
      'DATABASE_ERROR'
    );
  });
});
