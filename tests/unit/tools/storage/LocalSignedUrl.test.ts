import { LocalSignedUrl } from '@storage/LocalSignedUrl';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const base64UrlEncode = (value: string | Buffer): string => {
  const base64 = Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value).toString('base64');
  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
};

const sign = (payloadEncoded: string, secret: string): string => {
  const signature = createHmac('sha256', secret).update(payloadEncoded).digest();
  return base64UrlEncode(signature);
};

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

  it('rejects empty keys', () => {
    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: '   ', exp: Date.now() + 10_000, method: 'GET' },
        'test-secret'
      )
    ).toThrow();
  });

  it('rejects absolute or traversal keys', () => {
    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: '/etc/passwd', exp: Date.now() + 10_000, method: 'GET' },
        'test-secret'
      )
    ).toThrow();

    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: '../a.txt', exp: Date.now() + 10_000, method: 'GET' },
        'test-secret'
      )
    ).toThrow();

    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: 'a/./b.txt', exp: Date.now() + 10_000, method: 'GET' },
        'test-secret'
      )
    ).toThrow();
  });

  it('rejects keys containing null bytes', () => {
    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: 'a\0b.txt', exp: Date.now() + 10_000, method: 'GET' },
        'test-secret'
      )
    ).toThrow();
  });

  it('rejects invalid disk, method, or exp', () => {
    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 's3' as any, key: 'a.txt', exp: Date.now() + 10_000, method: 'GET' } as any,
        'test-secret'
      )
    ).toThrow();

    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: 'a.txt', exp: Date.now() + 10_000, method: 'PUT' as any } as any,
        'test-secret'
      )
    ).toThrow();

    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: 'a.txt', exp: 0, method: 'GET' },
        'test-secret'
      )
    ).toThrow();
  });

  it('rejects signing with an empty secret', () => {
    expect(() =>
      LocalSignedUrl.createToken(
        { disk: 'local', key: 'a.txt', exp: Date.now() + 10_000, method: 'GET' },
        ' '
      )
    ).toThrow();
  });

  it('rejects malformed tokens', () => {
    expect(() => LocalSignedUrl.verifyToken(' ', 'test-secret')).toThrow();
    expect(() => LocalSignedUrl.verifyToken('no-dot-here', 'test-secret')).toThrow();
    expect(() => LocalSignedUrl.verifyToken('a.b.c', 'test-secret')).toThrow();
  });

  it('rejects invalid signature', () => {
    const secret = 'test-secret';
    const now = Date.now();
    const token = LocalSignedUrl.createToken(
      { disk: 'local', key: 'uploads/avatar.png', exp: now + 10_000, method: 'GET' },
      secret
    );

    const [payloadEncoded] = token.split('.') as [string, string];
    const tampered = `${payloadEncoded}.invalid-signature`;
    expect(() => LocalSignedUrl.verifyToken(tampered, secret, now)).toThrow();
  });

  it('rejects invalid payload json', () => {
    const secret = 'test-secret';
    const payloadEncoded = base64UrlEncode('not-json');
    const signatureEncoded = sign(payloadEncoded, secret);
    const token = `${payloadEncoded}.${signatureEncoded}`;
    expect(() => LocalSignedUrl.verifyToken(token, secret)).toThrow();
  });

  it('rejects payloads that fail shape validation', () => {
    const secret = 'test-secret';
    const now = Date.now();

    const invalidDiskPayloadEncoded = base64UrlEncode(
      JSON.stringify({ disk: 's3', key: 'uploads/avatar.png', exp: now + 10_000, method: 'GET' })
    );
    const invalidDiskToken = `${invalidDiskPayloadEncoded}.${sign(invalidDiskPayloadEncoded, secret)}`;
    expect(() => LocalSignedUrl.verifyToken(invalidDiskToken, secret, now)).toThrow();

    const invalidMethodPayloadEncoded = base64UrlEncode(
      JSON.stringify({ disk: 'local', key: 'uploads/avatar.png', exp: now + 10_000, method: 'PUT' })
    );
    const invalidMethodToken = `${invalidMethodPayloadEncoded}.${sign(invalidMethodPayloadEncoded, secret)}`;
    expect(() => LocalSignedUrl.verifyToken(invalidMethodToken, secret, now)).toThrow();

    const invalidKeyPayloadEncoded = base64UrlEncode(
      JSON.stringify({ disk: 'local', key: '../oops.txt', exp: now + 10_000, method: 'GET' })
    );
    const invalidKeyToken = `${invalidKeyPayloadEncoded}.${sign(invalidKeyPayloadEncoded, secret)}`;
    expect(() => LocalSignedUrl.verifyToken(invalidKeyToken, secret, now)).toThrow();
  });
});
