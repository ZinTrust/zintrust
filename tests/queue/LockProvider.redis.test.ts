import { describe, expect, it, vi } from 'vitest';

type FakeRedis = {
  store: Map<string, string>;
  ttl: Map<string, number>;
  set: (
    key: string,
    _value: string,
    _mode: string,
    ttl: number,
    _nx: string
  ) => Promise<string | null>;
  del: (key: string) => Promise<number>;
  pexpire: (key: string, ttl: number) => Promise<number>;
  pttl: (key: string) => Promise<number>;
  scan: (
    cursor: string,
    _match: string,
    pattern: string,
    _count: string,
    _countValue: string
  ) => Promise<[string, string[]]>;
  incr: (key: string) => Promise<number>;
};

const fakeRedis: FakeRedis = {
  store: new Map(),
  ttl: new Map(),
  set: async (key, _value, _mode, ttl, _nx) => {
    if (fakeRedis.store.has(key)) {
      return null;
    }
    fakeRedis.store.set(key, 'locked');
    fakeRedis.ttl.set(key, ttl);
    return 'OK';
  },
  del: async (key) => {
    const existed = fakeRedis.store.has(key);
    fakeRedis.store.delete(key);
    fakeRedis.ttl.delete(key);
    return existed ? 1 : 0;
  },
  pexpire: async (key, ttl) => {
    if (!fakeRedis.store.has(key)) return 0;
    fakeRedis.ttl.set(key, ttl);
    return 1;
  },
  pttl: async (key) => {
    return fakeRedis.ttl.get(key) ?? -1;
  },
  scan: async (_cursor, _match, pattern) => {
    // Convert a Redis-style glob pattern to a safe regular expression
    const escapeRegex = (s: string) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escaped = escapeRegex(pattern);
    const regexPattern = '^' + escaped.replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexPattern);
    const keys = Array.from(fakeRedis.store.keys()).filter((k) => regex.test(k));
    return ['0', keys];
  },
  incr: async (key) => {
    const current = Number(fakeRedis.store.get(key) ?? 0);
    const next = current + 1;
    fakeRedis.store.set(key, String(next));
    return next;
  },
};

vi.mock('@config/workers', () => ({
  createRedisConnection: () => fakeRedis,
}));

vi.mock('@config/queue', () => ({
  createBaseDrivers: () => ({
    redis: { host: 'localhost', port: 6379, password: undefined, database: 0 },
  }),
}));

describe('LockProvider (redis)', async () => {
  const { createLockProvider } = await import('@queue/LockProvider');

  it('tracks collisions and lists locks via scan', async () => {
    const provider = createLockProvider({
      type: 'redis',
      prefix: 'test:',
      defaultTtl: 1000,
    });

    const first = await provider.acquire('job-1', { ttl: 1000 });
    const second = await provider.acquire('job-1', { ttl: 1000 });

    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(false);

    const locks = await provider.list('job-*');
    expect(locks).toContain('job-1');

    const status = await provider.status('job-1');
    expect(status.exists).toBe(true);

    await provider.release({ key: 'test:job-1', ttl: 1000, acquired: true, expires: new Date() });
    const after = await provider.status('job-1');
    expect(after.exists).toBe(false);
  });
});
