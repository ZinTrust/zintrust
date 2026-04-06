import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
  },
}));

describe('Security Config', () => {
  const originalEnv = { ...process.env };

  const loadSecurity = async (overrides: Record<string, string>) => {
    process.env = {
      ...originalEnv,
      APP_KEY: '',
      JWT_SECRET: '',
      JWT_ENABLED: 'true',
      NODE_ENV: 'development',
      ...overrides,
    };
    vi.resetModules();
    return import('@/config/security');
  };

  beforeEach(() => {
    vi.resetModules();
    process.env['JWT_SECRET'] = 'test-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it('should have correct properties', async () => {
    const { securityConfig } = await import('@/config/security');
    expect(securityConfig.jwt).toBeDefined();
    expect(securityConfig.csrf).toBeDefined();
    expect(securityConfig.encryption).toBeDefined();
    expect(securityConfig.apiKey).toBeDefined();
    expect(securityConfig.cors).toBeDefined();
    expect(securityConfig.rateLimit).toBeDefined();
    expect(securityConfig.xss).toBeDefined();
    expect(securityConfig.helmet).toBeDefined();
    expect(securityConfig.session).toBeDefined();
  });

  it('should fall back to dev secret when JWT_SECRET is missing in development', async () => {
    const { securityConfig } = await loadSecurity({
      NODE_ENV: 'development',
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
      APP_KEY: '',
    });
    expect(securityConfig.jwt.secret).toBe('dev-unsafe-jwt-secret');
  });

  it('should throw when JWT_SECRET is missing in production', async () => {
    const { securityConfig } = await loadSecurity({
      NODE_ENV: 'production',
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
      APP_KEY: '',
    });
    expect(() => securityConfig.jwt.secret).toThrow('Missing required secret: JWT_SECRET');
  });

  it('should return empty string when JWT is disabled', async () => {
    const { securityConfig } = await loadSecurity({
      NODE_ENV: 'production',
      JWT_ENABLED: 'false',
      JWT_SECRET: '',
      APP_KEY: '',
    });
    expect(securityConfig.jwt.secret).toBe('');
  });
});
