import { LocalSignedUrl } from '@storage/LocalSignedUrl';
import { describe, expect, it } from 'vitest';

describe('LocalSignedUrl', () => {
  it('creates and verifies a token', () => {
    const secret = 'test-secret';
    const now = Date.now();
    const token = LocalSignedUrl.createToken(
      { disk: 'local', key: 'uploads/avatar.png', exp: now + 10_000, method: 'GET' },
      secret
    );

    const payload = LocalSignedUrl.verifyToken(token, secret, now);
    expect(payload.disk).toBe('local');
    expect(payload.key).toBe('uploads/avatar.png');
    expect(payload.method).toBe('GET');
    expect(payload.exp).toBeGreaterThan(now);
  });

  it('rejects expired tokens', () => {
    const secret = 'test-secret';
    const now = Date.now();
    const token = LocalSignedUrl.createToken(
      { disk: 'local', key: 'uploads/avatar.png', exp: now - 1, method: 'GET' },
      secret
    );

    expect(() => LocalSignedUrl.verifyToken(token, secret, now)).toThrow();
  });
});
