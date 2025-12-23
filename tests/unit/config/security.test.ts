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

  it('should throw when JWT_SECRET is missing', async () => {
    delete process.env['JWT_SECRET'];
    vi.resetModules();

    // In non-production environments, missing JWT_SECRET should not crash import;
    // it should warn and fall back to a deterministic dev secret.
    process.env['NODE_ENV'] = 'development';
    const { securityConfig } = await import('@/config/security');
    expect(securityConfig.jwt.secret).toBe('dev-unsafe-jwt-secret');

    // In production, missing JWT_SECRET should throw.
    delete process.env['JWT_SECRET'];
    vi.resetModules();
    process.env['NODE_ENV'] = 'production';
    await expect(import('@/config/security')).rejects.toThrow(
      'Missing required secret: JWT_SECRET'
    );
  });
});
