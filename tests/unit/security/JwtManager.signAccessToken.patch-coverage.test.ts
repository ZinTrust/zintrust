import { describe, expect, it, vi } from 'vitest';

describe('JwtManager.signAccessToken (patch coverage)', () => {
  it('signs HS256 token and includes subject when payload.sub is a string', async () => {
    vi.resetModules();

    vi.doMock('@/config', () => ({
      securityConfig: {
        jwt: {
          algorithm: 'HS256',
          secret: 'test-secret',
          expiresIn: 60,
          issuer: 'zintrust',
          audience: 'tests',
        },
      },
    }));

    const { JwtManager } = await import('@/security/JwtManager');

    const token = JwtManager.signAccessToken({ sub: 'user-1', email: 'a@example.com' });
    expect(typeof token).toBe('string');

    const verifier = JwtManager.create();
    verifier.setHmacSecret('test-secret');

    const payload = verifier.verify(token, 'HS256');
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@example.com');
    expect(payload.iss).toBe('zintrust');
    expect(payload.aud).toBe('tests');
  });

  it('throws when configured for RS256 without RSA keys', async () => {
    vi.resetModules();

    vi.doMock('@/config', () => ({
      securityConfig: {
        jwt: {
          algorithm: 'RS256',
          secret: 'unused',
          expiresIn: 60,
          issuer: 'zintrust',
          audience: 'tests',
        },
      },
    }));

    const { JwtManager } = await import('@/security/JwtManager');

    expect(() => JwtManager.signAccessToken({ sub: 'user-1' })).toThrow();
  });
});
