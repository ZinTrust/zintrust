import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  delete (globalThis as any).Deno;
  delete process.env['C1'];
});

describe('SecretsManager caching and rotation branches', () => {
  it('returns cached value until cleared', async () => {
    process.env['C1'] = 'v1';

    const { SecretsManager } = await import('@config/SecretsManager');

    SecretsManager.getInstance({ platform: 'local' });

    const first = await SecretsManager.getSecret('C1');
    expect(first).toBe('v1');

    // change underlying value and expect cached still returned
    process.env['C1'] = 'v2';
    const second = await SecretsManager.getSecret('C1');
    expect(second).toBe('v1');

    // clear cache for the key
    SecretsManager.clearCache('C1');
    const third = await SecretsManager.getSecret('C1');
    expect(third).toBe('v2');

    // clear all cache
    SecretsManager.clearCache();
  });

  it('rotateSecret throws appropriate errors for aws and others', async () => {
    const { SecretsManager } = await import('@config/SecretsManager');

    // local platform
    SecretsManager.getInstance({ platform: 'local' });
    await expect(SecretsManager.rotateSecret('k')).rejects.toHaveProperty('code', 'CONFIG_ERROR');

    // aws platform
    SecretsManager.getInstance({ platform: 'aws' });
    await expect(SecretsManager.rotateSecret('k')).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('cloudflare without kv throws config error', async () => {
    const { SecretsManager } = await import('@config/SecretsManager');
    SecretsManager.getInstance({ platform: 'cloudflare' as any });

    await expect(SecretsManager.getSecret('x')).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });
});
