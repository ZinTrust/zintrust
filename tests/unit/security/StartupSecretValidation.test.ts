import { describe, expect, it, vi } from 'vitest';

describe('StartupSecretValidation', () => {
  const originalEnv = process.env;
  const validAppKey = Buffer.from(
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    'hex'
  ).toString('base64');

  it('passes in non-production regardless of secrets', async () => {
    vi.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'development' };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails in production when JWT is enabled and JWT_SECRET is missing', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    const result = StartupSecretValidation.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'JWT_SECRET')).toBe(true);

    expect(() => StartupSecretValidation.assertValid()).toThrow(/startup secret/i);
  });

  it('fails in production when API key auth is enabled and API_KEY_SECRET is missing', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      API_KEY_ENABLED: 'true',
      API_KEY_SECRET: '',
      // Ensure JWT check does not dominate this case
      JWT_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    const result = StartupSecretValidation.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'API_KEY_SECRET')).toBe(true);
  });

  it('respects STARTUP_VALIDATE_SECRETS=false', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      STARTUP_VALIDATE_SECRETS: 'false',
      ENCRYPTION_CIPHER: '',
      APP_KEY: '',
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when ENCRYPTION_CIPHER is unsupported in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-128-cbc',
      APP_KEY: validAppKey,
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'ENCRYPTION_CIPHER')).toBe(true);
  });

  it('fails when APP_KEY is missing in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: '',
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_KEY')).toBe(true);
  });

  it('fails when APP_KEY is not valid base64 in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: '!!!invalid',
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_KEY')).toBe(true);
  });

  it('fails when APP_KEY has wrong byte length in production', async () => {
    vi.resetModules();
    const shortKey = Buffer.from('short', 'utf8').toString('base64');
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: shortKey,
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_KEY')).toBe(true);
  });

  it('fails when APP_PREVIOUS_KEYS is invalid JSON in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      APP_PREVIOUS_KEYS: '[not-valid-json',
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_PREVIOUS_KEYS')).toBe(true);
  });

  it('fails when APP_PREVIOUS_KEYS JSON is not an array of strings in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      APP_PREVIOUS_KEYS: JSON.stringify([1, 2, 3]),
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_PREVIOUS_KEYS')).toBe(true);
  });
});
