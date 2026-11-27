import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Cloudflare } from '@config/cloudflare';

const setEnv = (value: unknown) => {
  (globalThis as any).env = value;
};

describe('Cloudflare uncovered branches', () => {
  beforeEach(() => setEnv(undefined));
  afterEach(() => setEnv(undefined));

  it('getWorkersEnv returns null for missing, null and non-object values', () => {
    expect(Cloudflare.getWorkersEnv()).toBeNull();
    setEnv(null);
    expect(Cloudflare.getWorkersEnv()).toBeNull();
    setEnv('nope');
    expect(Cloudflare.getWorkersEnv()).toBeNull();
    setEnv({ DB: 'db' });
    expect(Cloudflare.getWorkersEnv()).toEqual({ DB: 'db' });
  });

  it('getD1Binding uses explicit config before env and global fallbacks', () => {
    const explicit = { name: 'explicit' } as any;
    expect(Cloudflare.getD1Binding({ d1: explicit })).toBe(explicit);
  });

  it('getD1Binding resolves env candidates, deduplicates names and falls back to globals', () => {
    const binding = { name: 'env-db' } as any;
    setEnv({ DB: binding, zintrust_db: binding, D1_BINDING: 'DB', custom_db: binding });
    expect(Cloudflare.getD1Binding({})).toBe(binding);

    setEnv({ D1_BINDING: 'custom_db', custom_db: binding });
    expect(Cloudflare.getD1Binding({})).toBe(binding);

    setEnv(undefined);
    (globalThis as any).DB = binding;
    expect(Cloudflare.getD1Binding({})).toBe(binding);
    delete (globalThis as any).DB;
    expect(Cloudflare.getD1Binding({})).toBeNull();
  });

  it('getKVBinding handles missing env, explicit name, var fallback and default', () => {
    expect(Cloudflare.getKVBinding('KV')).toBeNull();
    const kv = { get: () => undefined } as any;
    setEnv({ KV: kv, CACHE: kv, KV_NAMESPACE: 'KV' });
    expect(Cloudflare.getKVBinding('KV')).toBe(kv);
    expect(Cloudflare.getKVBinding('  ')).toBe(kv);
    expect(Cloudflare.getKVBinding()).toBe(kv);
    setEnv({ CACHE: kv });
    expect(Cloudflare.getKVBinding()).toBe(kv);
    setEnv({});
    expect(Cloudflare.getKVBinding()).toBeNull();
  });

  it('getR2Binding handles explicit name and default names', () => {
    expect(Cloudflare.getR2Binding()).toBeNull();
    const bucket = { put: () => undefined } as any;
    setEnv({ MY_BUCKET: bucket, R2: bucket });
    expect(Cloudflare.getR2Binding('MY_BUCKET')).toBe(bucket);
    expect(Cloudflare.getR2Binding('  ')).toBe(bucket);
    setEnv({ BUCKET: bucket });
    expect(Cloudflare.getR2Binding()).toBe(bucket);
    setEnv({});
    expect(Cloudflare.getR2Binding()).toBeNull();
  });

  it('getWorkersVar stringifies values and returns null for missing ones', () => {
    setEnv({ S: 'text', N: 42, B: true });
    expect(Cloudflare.getWorkersVar('S')).toBe('text');
    expect(Cloudflare.getWorkersVar('N')).toBe('42');
    expect(Cloudflare.getWorkersVar('B')).toBe('true');
    expect(Cloudflare.getWorkersVar('MISSING')).toBeNull();
    setEnv(undefined);
    expect(Cloudflare.getWorkersVar('S')).toBeNull();
  });

  it('getAssetsBinding validates the fetch method', () => {
    expect(Cloudflare.getAssetsBinding()).toBeNull();
    setEnv({ ASSETS: { get: () => undefined } });
    expect(Cloudflare.getAssetsBinding()).toBeNull();
    const assets = { fetch: async () => new Response('ok') } as any;
    setEnv({ ASSETS: assets });
    expect(Cloudflare.getAssetsBinding()).toBe(assets);
  });

  it('isCloudflareSocketsEnabled recognizes true/1 and rejects blank or false', () => {
    expect(Cloudflare.isCloudflareSocketsEnabled()).toBe(false);
    setEnv({ ENABLE_CLOUDFLARE_SOCKETS: '' });
    expect(Cloudflare.isCloudflareSocketsEnabled()).toBe(false);
    setEnv({ ENABLE_CLOUDFLARE_SOCKETS: 'false' });
    expect(Cloudflare.isCloudflareSocketsEnabled()).toBe(false);
    setEnv({ ENABLE_CLOUDFLARE_SOCKETS: ' TRUE ' });
    expect(Cloudflare.isCloudflareSocketsEnabled()).toBe(true);
    setEnv({ ENABLE_CLOUDFLARE_SOCKETS: '1' });
    expect(Cloudflare.isCloudflareSocketsEnabled()).toBe(true);
  });
});
