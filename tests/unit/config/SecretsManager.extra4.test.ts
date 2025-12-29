import { describe, expect, test, vi } from 'vitest';

// These tests target uncovered branches in SecretsManager (cloudflare errors,
// deno/node env negative cases, cache behavior, and pruneCache loop path).

// sanity check to ensure test runner picks this file up
test('secrets-extra sanity', () => {
  expect(true).toBe(true);
});

describe('SecretsManager - extra error and cache branches', () => {
  test('cloudflare operations throw when kv namespace not provided', async () => {
    vi.resetModules();
    const { SecretsManager } = await import('@config/SecretsManager');

    const sm = SecretsManager.getInstance({ platform: 'cloudflare' });
    await expect(sm.getSecret('k')).rejects.toThrow('Cloudflare KV namespace not configured');
    await expect(sm.setSecret('k', 'v')).rejects.toThrow('Cloudflare KV namespace not configured');
    await expect(sm.deleteSecret('k')).rejects.toThrow('Cloudflare KV namespace not configured');
    await expect(sm.listSecrets()).rejects.toThrow('Cloudflare KV namespace not configured');
  });

  test('cloudflare get returns not found when kv returns null or empty', async () => {
    vi.resetModules();
    const kv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const { SecretsManager } = await import('@config/SecretsManager');
    const sm = SecretsManager.getInstance({ platform: 'cloudflare', kv });
    await expect(sm.getSecret('k')).rejects.toThrow('Secret not found');

    // empty string
    vi.resetModules();
    const kv2 = {
      get: vi.fn().mockResolvedValue(''),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const { SecretsManager: SM2 } = await import('@config/SecretsManager');
    const sm2 = SM2.getInstance({ platform: 'cloudflare', kv: kv2 });
    await expect(sm2.getSecret('k')).rejects.toThrow('Secret not found');
  });

  test('deno env not found and node env not found paths', async () => {
    // deno missing
    vi.resetModules();
    // @ts-ignore
    globalThis.Deno = { env: { get: (_k) => undefined } };
    const { SecretsManager } = await import('@config/SecretsManager');
    const sm = SecretsManager.getInstance({ platform: 'deno' });
    await expect(sm.getSecret('X')).rejects.toThrow('Secret not found');
    // cleanup
    // @ts-ignore
    delete globalThis.Deno;

    // node env missing
    vi.resetModules();
    delete process.env['SOME_SECRET_NOT_SET'];
    const { SecretsManager: SM2 } = await import('@config/SecretsManager');
    const sm2 = SM2.getInstance({ platform: 'local' });
    await expect(sm2.getSecret('SOME_SECRET_NOT_SET')).rejects.toThrow('Secret not found');
  });

  test('getInstance without configuration throws', async () => {
    vi.resetModules();
    const { SecretsManager } = await import('@config/SecretsManager');
    expect(() => SecretsManager.getInstance()).toThrow('SecretsManager not initialized');
  });

  test('cache hit returns cached value and clearCache(key) removes it', async () => {
    vi.resetModules();
    const kv = {
      get: vi.fn().mockResolvedValue('first'),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const { SecretsManager } = await import('@config/SecretsManager');
    const sm = SecretsManager.getInstance({ platform: 'cloudflare', kv });

    expect(await sm.getSecret('k')).toBe('first');

    // make backend throw, but cached value should still be returned
    kv.get.mockRejectedValueOnce(new Error('backend boom'));
    expect(await sm.getSecret('k')).toBe('first');

    // clear cache for key and subsequent get should now surface backend error
    sm.clearCache('k');
    await expect(sm.getSecret('k')).rejects.toThrow('backend boom');
  });

  test('pruneCache loop executes when many keys are added', async () => {
    vi.resetModules();
    const kv = {
      get: vi.fn((k) => Promise.resolve(`v:${k}`)),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [] }),
    };
    const { SecretsManager } = await import('@config/SecretsManager');
    const sm = SecretsManager.getInstance({ platform: 'cloudflare', kv });

    // populate more than 505 unique keys to hit pruneCache > 500 path
    const count = 506;
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      await sm.getSecret(`k-${i}`);
    }

    // If prune runs, the manager should still function for a new key
    await expect(sm.getSecret('final-key')).resolves.toBe('v:final-key');
  }, 120000);
});
