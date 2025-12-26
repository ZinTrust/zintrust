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
});
