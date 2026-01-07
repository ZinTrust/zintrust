import { describe, expect, test, vi } from 'vitest';

describe('StartupSecretValidation - extra branches', () => {
  test('validates when all required env secrets present (production)', async () => {
    vi.resetModules();
    const originalEnv = process.env;
    const validAppKey = Buffer.from(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      'hex'
    ).toString('base64');
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      STARTUP_VALIDATE_SECRETS: 'true',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      JWT_ENABLED: 'true',
      JWT_SECRET: 's',
      API_KEY_ENABLED: 'true',
      API_KEY_SECRET: 's',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('respects validateSecrets=false via startup config mock', async () => {
    vi.resetModules();
    vi.mock('@config/startup', () => ({ startupConfig: { validateSecrets: false } }));
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    } as any;

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
