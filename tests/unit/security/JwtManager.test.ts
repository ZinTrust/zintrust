import { JwtManager } from '@/security/JwtManager';
import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

describe('JwtManager', () => {
  let jwtManager: JwtManager;
  const hmacSecret = 'test-secret-key';

  beforeEach(() => {
    jwtManager = new JwtManager();
    jwtManager.setHmacSecret(hmacSecret);
  });

  it('should sign and verify a token using HS256', () => {
    const payload = { userId: 123, role: 'admin' };
    const token = jwtManager.sign(payload);

    expect(token).toBeDefined();
    expect(token.split('.')).toHaveLength(3);

    const decoded = jwtManager.verify(token);
    expect(decoded['userId']).toBe(123);
    expect(decoded['role']).toBe('admin');
    expect(decoded['iat']).toBeDefined();
  });

  it('should sign and verify a token using HS512', () => {
    const payload = { userId: 456 };
    const token = jwtManager.sign(payload, { algorithm: 'HS512' });

    const decoded = jwtManager.verify(token, 'HS512');
    expect(decoded['userId']).toBe(456);
  });

  it('should fail verification if signature is invalid', () => {
    const payload = { userId: 123 };
    const token = jwtManager.sign(payload);
    const parts = token.split('.');
    const invalidToken = `${parts[0]}.${parts[1]}.invalidsignature`;

    expect(() => jwtManager.verify(invalidToken)).toThrow(
      'Token verification failed: Invalid signature'
    );
  });

  it('should fail verification if token is expired', () => {
    const payload = { userId: 123 };
    // Create a token that expires in the past
    const token = jwtManager.sign(payload, { expiresIn: -100 });

    expect(() => jwtManager.verify(token)).toThrow('Token verification failed: Token expired');
  });

  it('should fail verification if algorithm mismatches', () => {
    const payload = { userId: 123 };
    const token = jwtManager.sign(payload, { algorithm: 'HS256' });

    expect(() => jwtManager.verify(token, 'HS512')).toThrow(/Algorithm mismatch/);
  });

  it('should decode token without verification', () => {
    const payload = { userId: 123 };
    const token = jwtManager.sign(payload);

    const decoded = jwtManager.decode(token);
    expect(decoded['userId']).toBe(123);
  });

  it('should sign and verify using RS256', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    jwtManager.setRsaKeys(privateKey, publicKey);

    const payload = { userId: 789 };
    const token = jwtManager.sign(payload, { algorithm: 'RS256' });

    const decoded = jwtManager.verify(token, 'RS256');
    expect(decoded['userId']).toBe(789);
  });

  it('should throw error if RSA keys are missing for RS256', () => {
    const noKeyManager = new JwtManager();
    expect(() => noKeyManager.sign({}, { algorithm: 'RS256' })).toThrow(
      'RSA private key not configured'
    );
  });

  it('should throw error if HMAC secret is missing for HS256', () => {
    const noKeyManager = new JwtManager();
    expect(() => noKeyManager.sign({}, { algorithm: 'HS256' })).toThrow(
      'HMAC secret not configured'
    );
  });

  it('should handle custom claims (iss, aud, sub, jti)', () => {
    const payload = { data: 'test' };
    const options = {
      issuer: 'my-app',
      audience: 'my-users',
      subject: 'user-1',
      jwtId: 'unique-id',
    };

    const token = jwtManager.sign(payload, options);
    const decoded = jwtManager.verify(token);

    expect(decoded.iss).toBe('my-app');
    expect(decoded.aud).toBe('my-users');
    expect(decoded.sub).toBe('user-1');
    expect(decoded.jti).toBe('unique-id');
  });
});
