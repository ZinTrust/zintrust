import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  delete (globalThis as any).Deno;
  delete process.env['TEST_SECRET'];
});

describe('SecretsManager - cloudflare and env branches', () => {
  it('get/set/delete/list with Cloudflare KV', async () => {
    const kv = {
      get: vi.fn().mockResolvedValue('svalue'),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [{ name: 'a' }, { name: 'b' }] }),
    } as const;

    const { SecretsManager } = await import('@config/SecretsManager');

    // Initialize with cloudflare
    SecretsManager.getInstance({ platform: 'cloudflare', kv: kv as any });

    const val = await SecretsManager.getSecret('s1');
    expect(val).toBe('svalue');

    // list
    const list = await SecretsManager.listSecrets();
    expect(list).toEqual(['a', 'b']);

    // set should call kv.put
    await SecretsManager.setSecret('s2', 'v2', { expirationTtl: 60 });
    expect(kv.put).toHaveBeenCalledWith('s2', 'v2', { expirationTtl: 60 });

    // delete should call kv.delete
    await SecretsManager.deleteSecret('s2');
    expect(kv.delete).toHaveBeenCalledWith('s2');
  });

  it('throws not found when kv.get returns null', async () => {
    const kv = {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ keys: [] }),
    } as const;

    const { SecretsManager } = await import('@config/SecretsManager');

    SecretsManager.getInstance({ platform: 'cloudflare', kv: kv as any });

    await expect(SecretsManager.getSecret('missing')).rejects.toHaveProperty('code', 'NOT_FOUND');
  });

  it('works with Deno env and throws when missing', async () => {
    (globalThis as any).Deno = { env: { get: (k: string) => (k === 'GOOD' ? 'X' : undefined) } };

    const { SecretsManager } = await import('@config/SecretsManager');
    SecretsManager.getInstance({ platform: 'deno' });

    await expect(SecretsManager.getSecret('GOOD')).resolves.toBe('X');
    await expect(SecretsManager.getSecret('BAD')).rejects.toHaveProperty('code', 'NOT_FOUND');
  });

  it('works with local env and set/delete throw appropriately', async () => {
    process.env['TEST_SECRET'] = 'LOCAL';

    const { SecretsManager } = await import('@config/SecretsManager');
    SecretsManager.getInstance({ platform: 'local' });

    await expect(SecretsManager.getSecret('TEST_SECRET')).resolves.toBe('LOCAL');

    // set and delete should throw config errors
    await expect(SecretsManager.setSecret('TEST_SECRET', 'x')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
    await expect(SecretsManager.deleteSecret('TEST_SECRET')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });
});
