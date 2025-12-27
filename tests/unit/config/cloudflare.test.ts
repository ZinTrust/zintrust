import { describe, expect, it } from 'vitest';

describe('Cloudflare config', () => {
  it('returns nulls when no Workers env is present', async () => {
    delete (globalThis as unknown as Record<string, unknown>)['env'];
    delete (globalThis as unknown as Record<string, unknown>)['DB'];

    const { Cloudflare } = await import('@config/cloudflare');

    expect(Cloudflare.getWorkersEnv()).toBeNull();
    expect(Cloudflare.getKVBinding('CACHE')).toBeNull();
    expect(Cloudflare.getD1Binding({ driver: 'd1' } as any)).toBeNull();
  });

  it('reads D1 binding from globalThis.env.DB and KV from env.CACHE', async () => {
    const mockDb = { prepare: () => undefined };
    const mockKv = {
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    };

    (globalThis as unknown as Record<string, unknown>)['env'] = {
      DB: mockDb,
      CACHE: mockKv,
    };

    const { Cloudflare } = await import('@config/cloudflare');

    expect(Cloudflare.getWorkersEnv()).not.toBeNull();
    expect(Cloudflare.getD1Binding({ driver: 'd1' } as any)).toBe(mockDb);
    expect(Cloudflare.getKVBinding('CACHE')).toBe(mockKv);
  });

  it('prefers config.d1 over env/global bindings', async () => {
    const configDb = { prepare: () => undefined };
    const envDb = { prepare: () => undefined };

    (globalThis as unknown as Record<string, unknown>)['env'] = { DB: envDb };

    const { Cloudflare } = await import('@config/cloudflare');

    expect(Cloudflare.getD1Binding({ driver: 'd1', d1: configDb } as any)).toBe(configDb);
  });

  it('falls back to globalThis.DB when env is not present', async () => {
    delete (globalThis as unknown as Record<string, unknown>)['env'];

    const globalDb = { prepare: () => undefined };
    (globalThis as unknown as Record<string, unknown>)['DB'] = globalDb;

    const { Cloudflare } = await import('@config/cloudflare');

    expect(Cloudflare.getD1Binding({ driver: 'd1' } as any)).toBe(globalDb);

    delete (globalThis as unknown as Record<string, unknown>)['DB'];
  });
});
