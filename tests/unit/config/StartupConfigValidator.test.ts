import { describe, expect, it, vi } from 'vitest';

describe('StartupConfigValidator', () => {
  const originalEnv = process.env;

  it('validates defaults successfully', async () => {
    vi.resetModules();
    process.env = { ...originalEnv };

    const { StartupConfigValidator } = await import('@/config/StartupConfigValidator');
    const result = StartupConfigValidator.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for invalid LOG_FORMAT', async () => {
    vi.resetModules();
    process.env = { ...originalEnv, LOG_FORMAT: 'xml' };

    const { StartupConfigValidator } = await import('@/config/StartupConfigValidator');
    const result = StartupConfigValidator.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'LOG_FORMAT')).toBe(true);
  });

  it('fails in production when APP_KEY is missing/short and redacts value', async () => {
    vi.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'production', APP_KEY: 'short' };

    const { StartupConfigValidator } = await import('@/config/StartupConfigValidator');
    const result = StartupConfigValidator.validate();
    expect(result.valid).toBe(false);

    const appKeyError = result.errors.find((e) => e.key === 'APP_KEY');
    expect(appKeyError).toBeDefined();
    expect(appKeyError?.value).toBe('<redacted>');
  });

  it('throws ConfigError from assertValid when invalid', async () => {
    vi.resetModules();
    process.env = { ...originalEnv, LOG_ROTATION_DAYS: '0' };

    const { StartupConfigValidator } = await import('@/config/StartupConfigValidator');
    expect(() => StartupConfigValidator.assertValid()).toThrow(/Invalid startup configuration/);
  });

  it('strict mode: trims whitespace env, supports PORT alias APP_PORT, and validates APP_KEY length', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STARTUP_REQUIRE_ENV: 'yes',
      NODE_ENV: 'development',
      APP_NAME: '   ',
      HOST: 'localhost',
      // PORT intentionally omitted; strict mode should accept APP_PORT
      APP_PORT: '3000',
      DB_CONNECTION: 'postgres',
      APP_KEY: 'short',
      LOG_LEVEL: 'debug',
      LOG_CHANNEL: 'console',
    };

    const { StartupConfigValidator } = await import('@/config/StartupConfigValidator');
    const result = StartupConfigValidator.validate();

    expect(result.valid).toBe(false);
    // Whitespace-only APP_NAME is treated as missing
    expect(result.errors.some((e) => e.key === 'APP_NAME')).toBe(true);
    // Strict mode APP_KEY min length
    expect(result.errors.some((e) => e.key === 'APP_KEY')).toBe(true);
    // Non-sqlite should not require DB_DATABASE / DB_PATH
    expect(result.errors.some((e) => e.key === 'DB_DATABASE')).toBe(false);
  });

  it('strict mode sqlite: requires DB_DATABASE or DB_PATH', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      STARTUP_REQUIRE_ENV: '1',
      NODE_ENV: 'development',
      APP_NAME: 'zintrust-app',
      HOST: 'localhost',
      PORT: '3000',
      DB_CONNECTION: 'sqlite',
      APP_KEY: 'this-is-a-long-enough-key',
      LOG_LEVEL: 'debug',
      LOG_CHANNEL: 'console',
      // DB_DATABASE and DB_PATH intentionally omitted
    };

    const { StartupConfigValidator } = await import('@/config/StartupConfigValidator');
    const result = StartupConfigValidator.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'DB_DATABASE')).toBe(true);
  });
});
