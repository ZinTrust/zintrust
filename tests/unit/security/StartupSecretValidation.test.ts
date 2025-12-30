import { describe, expect, it, vi } from 'vitest';

describe('StartupSecretValidation', () => {
  const originalEnv = process.env;

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
    process.env = { ...originalEnv, NODE_ENV: 'production', JWT_ENABLED: 'true', JWT_SECRET: '' };

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
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
