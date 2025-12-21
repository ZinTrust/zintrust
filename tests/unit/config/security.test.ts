import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
