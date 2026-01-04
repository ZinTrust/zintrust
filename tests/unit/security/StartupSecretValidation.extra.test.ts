import { describe, expect, test, vi } from 'vitest';

describe('StartupSecretValidation - extra branches', () => {
  test('validates when all required env secrets present (production)', async () => {
    vi.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      STARTUP_VALIDATE_SECRETS: 'true',
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
