import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: TokenRevocation expiry cleanup', () => {
  it('deletes expired tokens when checked', async () => {
    vi.resetModules();

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: () => ({ exp: Math.floor(Date.now() / 1000) - 1 }),
        }),
      },
    }));

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    const token = await TokenRevocation.revoke('Bearer t');
    expect(token).toBe('t');

    const revoked = await TokenRevocation.isRevoked('t');
    expect(revoked).toBe(false);
  });
});
