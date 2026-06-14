import { FeatureFlags } from '@config/features';
import { D1Adapter } from '@orm/adapters/D1Adapter';
import { Database } from '@orm/Database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface PreparedCall {
  sql: string;
  source: 'primary' | 'session';
}

const createBinding = (options: {
  withSession?: boolean;
  bookmark?: string | null;
  servedByPrimary?: boolean;
  servedByRegion?: string;
}): { binding: unknown; calls: PreparedCall[] } => {
  const calls: PreparedCall[] = [];

  const makePrepared = (source: 'primary' | 'session') => (sql: string) => {
    calls.push({ sql, source });
    return {
      bind: () => ({
        all: async () => ({
          success: true,
          results: [{ id: 1 }],
          meta: {
            changes: 0,
            served_by_primary: options.servedByPrimary,
            served_by_region: options.servedByRegion,
          },
        }),
        first: async () => ({ id: 1 }),
        run: async () => ({ success: true, meta: { changes: 1 } }),
      }),
    };
  };

  const binding: Record<string, unknown> = {
    prepare: makePrepared('primary'),
  };

  if (options.withSession === true) {
    binding['withSession'] = (_constraint: string) => ({
      prepare: makePrepared('session'),
      getBookmark: () => options.bookmark ?? null,
    });
  }

  return { binding, calls };
};

describe('D1 read replication via Sessions API', () => {
  afterEach(() => {
    delete (globalThis as { env?: unknown }).env;
    FeatureFlags.reset();
  });

  beforeEach(() => {
    FeatureFlags.reset();
  });

  it('extracts served_by_primary / served_by_region into the query result', async () => {
    const { binding } = createBinding({ servedByPrimary: false, servedByRegion: 'wnam' });
    (globalThis as { env?: unknown }).env = { DB: binding };

    const adapter = D1Adapter.create({ driver: 'd1' });
    await adapter.connect();

    const result = await adapter.query('SELECT * FROM users', []);
    expect(result.servedByPrimary).toBe(false);
    expect(result.servedByRegion).toBe('wnam');
  });

  it('withReadSession is a passthrough returning null bookmark when replication is disabled', async () => {
    const { binding } = createBinding({ withSession: true, bookmark: 'bm-1' });
    (globalThis as { env?: unknown }).env = { DB: binding };
    FeatureFlags.setD1ReadReplicationEnabled(false);

    const db = Database.create({ driver: 'd1' });
    await db.connect();

    const { result, bookmark } = await db.withReadSession(async (scoped) => {
      await scoped.queryOne('SELECT 1', []);
      return 'done';
    });

    expect(result).toBe('done');
    expect(bookmark).toBeNull();
  });

  it('routes scoped reads through the session and surfaces the bookmark when enabled', async () => {
    const { binding, calls } = createBinding({ withSession: true, bookmark: 'bm-42' });
    (globalThis as { env?: unknown }).env = { DB: binding };
    FeatureFlags.setD1ReadReplicationEnabled(true);

    const db = Database.create({ driver: 'd1' });
    await db.connect();

    const { bookmark } = await db.withReadSession(
      async (scoped) => {
        await scoped.queryOne('SELECT * FROM users WHERE id = ?', [1]);
        return null;
      },
      { constraint: 'first-unconstrained' }
    );

    expect(bookmark).toBe('bm-42');
    expect(calls.some((c) => c.source === 'session')).toBe(true);
    expect(calls.some((c) => c.source === 'primary' && c.sql.includes('users'))).toBe(false);
  });

  it('falls back to the primary with null bookmark when the binding lacks withSession', async () => {
    const { binding } = createBinding({ withSession: false });
    (globalThis as { env?: unknown }).env = { DB: binding };
    FeatureFlags.setD1ReadReplicationEnabled(true);

    const db = Database.create({ driver: 'd1' });
    await db.connect();

    const { bookmark } = await db.withReadSession(async (scoped) => {
      await scoped.queryOne('SELECT 1', []);
      return 'ok';
    });

    expect(bookmark).toBeNull();
  });
});
