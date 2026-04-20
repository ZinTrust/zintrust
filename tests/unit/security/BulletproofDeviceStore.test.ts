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

import { BulletproofDeviceStore } from '@security/BulletproofDeviceStore';

type QueryStub = {
  where: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const createQueryStub = (): QueryStub => {
  const query = {
    where: vi.fn(),
    first: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  };

  query.where.mockReturnValue(query);
  return query;
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
    query.first.mockResolvedValueOnce(null).mockResolvedValueOnce({
      device_id: 'dev-2',
      signing_secret: 'secret-2',
      last_seen_at: '2026-04-20T02:00:00.000Z',
      created_at: '2026-04-20T02:00:00.000Z',
      updated_at: '2026-04-20T02:00:00.000Z',
    });
    query.insert.mockResolvedValue(undefined);

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
    } as never);

    const record = await BulletproofDeviceStore.upsert({
      userId: '   ',
      deviceId: 'dev-2',
      signingSecret: 'secret-2',
      userAgent: '   ',
      lastSeenAt: new Date('2026-04-20T02:00:00.000Z'),
    });

    expect(query.update).toHaveBeenCalledWith({
      user_id: null,
      device_id: 'dev-2',
      signing_secret: 'secret-2',
      user_agent: null,
      last_seen_at: '2026-04-20T02:00:00.000Z',
      created_at: '2026-04-20T02:00:00.000Z',
      updated_at: '2026-04-20T02:00:00.000Z',
    });
    expect(query.insert).toHaveBeenCalledTimes(1);
    expect(record).toEqual({
      deviceId: 'dev-2',
      signingSecret: 'secret-2',
      lastSeenAt: new Date('2026-04-20T02:00:00.000Z'),
      createdAt: new Date('2026-04-20T02:00:00.000Z'),
      updatedAt: new Date('2026-04-20T02:00:00.000Z'),
    });
  });

  it('wraps missing-table and invalid-record failures as config errors', async () => {
    const query = createQueryStub();
    query.first.mockRejectedValueOnce(new Error('missing column'));

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
    } as never);

    await expect(BulletproofDeviceStore.findByDeviceId('dev-3')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );

    query.first
      .mockResolvedValueOnce({ device_id: 'dev-4' })
      .mockResolvedValueOnce({ device_id: 'dev-4' });
    query.update.mockResolvedValue(1);

    await expect(
      BulletproofDeviceStore.upsert({
        deviceId: 'dev-4',
        signingSecret: 'secret-4',
        lastSeenAt: new Date('2026-04-20T04:00:00.000Z'),
      })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('deletes stored records and wraps delete failures', async () => {
    const query = createQueryStub();
    query.delete.mockResolvedValue(undefined);

    vi.mocked(useDatabase).mockReturnValue({
      table: vi.fn(() => query),
    } as never);

    await expect(BulletproofDeviceStore.removeByDeviceId(' dev-5 ')).resolves.toBeUndefined();
    expect(query.where).toHaveBeenCalledWith('device_id', '=', 'dev-5');

    query.delete.mockRejectedValueOnce(new Error('delete failed'));

    await expect(BulletproofDeviceStore.removeByDeviceId('dev-5')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });
});
