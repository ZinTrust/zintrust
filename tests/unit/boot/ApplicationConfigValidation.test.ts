import { describe, expect, it, vi } from 'vitest';

describe('Application boot config validation', () => {
  const originalEnv = process.env;

  it('rejects boot in production when APP_KEY is invalid', async () => {
    vi.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'production', APP_KEY: '' };

    const { Application } = await import('@/boot/Application');
    const app = Application.create('');

    await expect(app.boot()).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'CONFIG_ERROR',
    });
  });
});
