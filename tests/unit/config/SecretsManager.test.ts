import { SecretsManager } from '@/config/SecretsManager';
import { beforeEach, describe, expect, it } from 'vitest';

describe('SecretsManager', () => {
  beforeEach(() => {
    // Reset singleton instance if possible, or just re-initialize
    // SecretsManager.initialize({ platform: 'local' });
    // Since initialize is static and sets a module-level variable, we might need to be careful.
    // But for unit tests, we can just call initialize again.
  });

  it('should initialize with local config', () => {
    SecretsManager.getInstance({ platform: 'local' });
    expect(SecretsManager.getInstance()).toBeDefined();
  });

  it('should get secret from env in local mode', async () => {
    process.env['TEST_SECRET'] = 'secret-value';
    SecretsManager.getInstance({ platform: 'local' });

    const value = await SecretsManager.getSecret('TEST_SECRET');
    expect(value).toBe('secret-value');

    delete process.env['TEST_SECRET'];
  });

  it('should throw error if secret not found in local mode', async () => {
    SecretsManager.getInstance({ platform: 'local' });
    await expect(SecretsManager.getSecret('NON_EXISTENT')).rejects.toThrow(
      'Secret not found: NON_EXISTENT'
    );
  });

  it('should cache secrets', async () => {
    process.env['CACHED_SECRET'] = 'value1';
    SecretsManager.getInstance({ platform: 'local' });

    const val1 = await SecretsManager.getSecret('CACHED_SECRET');
    expect(val1).toBe('value1');

    // Change env var, but should still get cached value
    process.env['CACHED_SECRET'] = 'value2';
    const val2 = await SecretsManager.getSecret('CACHED_SECRET');
    expect(val2).toBe('value1');

    delete process.env['CACHED_SECRET'];
  });

  it('should clear cache', async () => {
    process.env['CACHED_SECRET'] = 'value1';
    SecretsManager.getInstance({ platform: 'local' });

    await SecretsManager.getSecret('CACHED_SECRET');

    process.env['CACHED_SECRET'] = 'value2';
    SecretsManager.clearCache('CACHED_SECRET');

    const val2 = await SecretsManager.getSecret('CACHED_SECRET');
    expect(val2).toBe('value2');

    delete process.env['CACHED_SECRET'];
  });
});
