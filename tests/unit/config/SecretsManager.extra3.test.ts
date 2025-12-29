import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('SecretsManager - additional branches', () => {
  beforeEach(() => {
    // Reset module singleton state for each test
    vi.resetModules();
    // clear env
    delete process.env['TEST_SECRET'];
    // remove global Deno env if set
    // @ts-ignore
    delete globalThis.Deno;
  });

  test('getFromEnv returns value and throws when missing', async () => {
    const { SecretsManager } = await import('@config/SecretsManager');

    // initializing with local platform
    SecretsManager.getInstance({ platform: 'local' });

    process.env['TEST_SECRET'] = 'local-value';

    await expect(SecretsManager.getSecret('TEST_SECRET')).resolves.toBe('local-value');

    // Clear cache so missing env will be detected
    SecretsManager.clearCache('TEST_SECRET');
    delete process.env['TEST_SECRET'];

    await expect(SecretsManager.getSecret('TEST_SECRET')).rejects.toThrow('Secret not found');
  });

  test('deno env path returns value and throws when missing', async () => {
    vi.resetModules();
    const { SecretsManager } = await import('@config/SecretsManager');

    // Set a fake Deno global
    // @ts-ignore
    globalThis.Deno = { env: { get: (_: string) => 'deno-val' } };

    SecretsManager.getInstance({ platform: 'deno' });

    await expect(SecretsManager.getSecret('ANY')).resolves.toBe('deno-val');

    // Now make Deno return empty to trigger not found
    // Reset module so a fresh instance picks up new Deno behavior
    vi.resetModules();
    // @ts-ignore
    globalThis.Deno = { env: { get: (_: string) => '' } };
    const { SecretsManager: SM2 } = await import('@config/SecretsManager');
    SM2.getInstance({ platform: 'deno' });

    await expect(SM2.getSecret('ANY')).rejects.toThrow('Secret not found');
  });

  test('cloudflare kv operations succeed and error when kv missing', async () => {
    const { SecretsManager } = await import('@config/SecretsManager');

    // Missing kv should throw on get
    SecretsManager.getInstance({ platform: 'cloudflare' });
    await expect(SecretsManager.getSecret('k')).rejects.toThrow(
      'Cloudflare KV namespace not configured'
    );

    // Provide a fake kv implementation - reset module so we can initialize with kv set
    vi.resetModules();
    const { SecretsManager: SM2 } = await import('@config/SecretsManager');

    const calls: string[] = [];
    const kv = {
      get: async (key: string) => {
        calls.push(`get:${key}`);
        if (key === 'notfound') return null;
        return 'cf-value';
      },
      put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
        calls.push(`put:${key}:${value}:${options?.expirationTtl ?? 0}`);
      },
      delete: async (key: string) => {
        calls.push(`delete:${key}`);
      },
      list: async (_options?: { prefix?: string }) => ({
        keys: [{ name: 'one' }, { name: 'two' }],
      }),
    };

    SM2.getInstance({ platform: 'cloudflare', kv } as any);

    // get existing
    await expect(SM2.getSecret('k')).resolves.toBe('cf-value');

    // get missing
    await expect(SM2.getSecret('notfound')).rejects.toThrow('Secret not found');

    // set should call put
    await expect(SM2.setSecret('k', 'v', { expirationTtl: 60 })).resolves.toBeUndefined();

    // delete should call delete
    await expect(SM2.deleteSecret('k')).resolves.toBeUndefined();

    // list should return names
    await expect(SM2.listSecrets('prefix')).resolves.toEqual(['one', 'two']);

    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  test('aws paths throw appropriate errors and list returns empty', async () => {
    const { SecretsManager } = await import('@config/SecretsManager');

    SecretsManager.getInstance({ platform: 'aws' });

    // getSecret should reject with try-catch wrapped error
    await expect(SecretsManager.getSecret('x')).rejects.toThrow(
      'Failed to retrieve secret from AWS'
    );

    // rotateSecret should reject with config error about not implemented
    await expect(SecretsManager.rotateSecret('x')).rejects.toThrow(
      'Secret rotation not implemented'
    );

    // listSecrets should return an empty array by default
    await expect(SecretsManager.listSecrets()).resolves.toEqual([]);
  });

  test('set/delete throw on deno/local platforms', async () => {
    vi.resetModules();
    const { SecretsManager } = await import('@config/SecretsManager');

    SecretsManager.getInstance({ platform: 'deno' });
    await expect(SecretsManager.setSecret('a', 'b')).rejects.toThrow(
      'Cannot set secrets in Deno environment'
    );
    await expect(SecretsManager.deleteSecret('a')).rejects.toThrow(
      'Cannot delete secrets in this environment'
    );

    // local - reset module to get fresh instance
    vi.resetModules();
    const { SecretsManager: SM2 } = await import('@config/SecretsManager');
    SM2.getInstance({ platform: 'local' });
    await expect(SM2.setSecret('a', 'b')).rejects.toThrow(
      'Cannot set secrets in local environment'
    );
    await expect(SM2.deleteSecret('a')).rejects.toThrow(
      'Cannot delete secrets in this environment'
    );
  });
});
