import { describe, expect, it } from 'vitest';

const b64url = (input: string): string =>
  Buffer.from(input, 'utf-8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const makeJwtWithExp = (expSeconds: number): string => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ exp: expSeconds }));
  return `${header}.${payload}.sig`;
};

describe('patch coverage: TokenRevocation memory expired delete branch', () => {
  it('deletes expired entries in isRevoked and returns false', async () => {
    const prev = process.env['JWT_REVOCATION_DRIVER'];
    process.env['JWT_REVOCATION_DRIVER'] = 'memory';

    try {
      const { TokenRevocation } = await import('../../../src/security/TokenRevocation');
      TokenRevocation._resetForTests();

      const expired = makeJwtWithExp(Math.floor(Date.now() / 1000) - 10);
      await expect(TokenRevocation.revoke(`Bearer ${expired}`)).resolves.toBe(expired);

      // Should delete and return false
      await expect(TokenRevocation.isRevoked(expired)).resolves.toBe(false);
      // Second call stays false (ensures deletion happened)
      await expect(TokenRevocation.isRevoked(expired)).resolves.toBe(false);
    } finally {
      if (prev === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
      else process.env['JWT_REVOCATION_DRIVER'] = prev;
    }
  });

  it('covers the in-method expiry delete branch (expires between cleanup and check)', async () => {
    const prev = process.env['JWT_REVOCATION_DRIVER'];
    process.env['JWT_REVOCATION_DRIVER'] = 'memory';

    const nowSpy = vi.spyOn(Date, 'now');
    // Date.now call order:
    // 1) revoke() -> memory cleanupExpired
    // 2) isRevoked() -> memory cleanupExpired
    // 3) isRevoked() -> expiry comparison
    nowSpy
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 0)
      .mockImplementationOnce(() => 2000);

    try {
      const { TokenRevocation } = await import('../../../src/security/TokenRevocation');
      TokenRevocation._resetForTests();

      // exp=1s => expiresAtMs=1000ms. Not expired during cleanupExpired (now=0),
      // but expired during the later comparison (now=2000) so it hits the delete+return-false branch.
      const token = makeJwtWithExp(1);
      await expect(TokenRevocation.revoke(`Bearer ${token}`)).resolves.toBe(token);
      await expect(TokenRevocation.isRevoked(token)).resolves.toBe(false);
    } finally {
      nowSpy.mockRestore();
      if (prev === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
      else process.env['JWT_REVOCATION_DRIVER'] = prev;
    }
  });
});
