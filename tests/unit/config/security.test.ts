import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
  },
}));

describe('Security Config', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['JWT_SECRET'] = 'test-secret';
  });

  afterEach(() => {
    delete process.env['JWT_SECRET'];
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
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_ENABLED', 'true');
    vi.stubEnv('JWT_SECRET', '');
    vi.resetModules();

    const { securityConfig } = await import('@/config/security');
    expect(securityConfig.jwt.secret).toBe('dev-unsafe-jwt-secret');
  });

  it('should throw when JWT_SECRET is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_ENABLED', 'true');
    vi.stubEnv('JWT_SECRET', '');
    vi.resetModules();

    const { securityConfig } = await import('@/config/security');
    expect(() => securityConfig.jwt.secret).toThrow('Missing required secret: JWT_SECRET');
  });
});
