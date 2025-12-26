import type { IJwtManager } from '@/security/JwtManager';
import { JwtManager } from '@/security/JwtManager';
import { generateKeyPairSync } from '@node-singletons/crypto';
import { beforeEach, describe, expect, it } from 'vitest';

describe('JwtManager', () => {
  let jwtManager: IJwtManager;
  const hmacSecret = 'test-secret-key';

  const base64Url = (input: string): string =>
    Buffer.from(input, 'utf8')
      .toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');

  beforeEach(() => {
    jwtManager = JwtManager.create();
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
    const noKeyManager = JwtManager.create();
    expect(() => noKeyManager.sign({}, { algorithm: 'RS256' })).toThrow(
      'RSA private key not configured'
    );
  });

  it('should throw error if HMAC secret is missing for HS256', () => {
    const noKeyManager = JwtManager.create();
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

  it('should throw on invalid token format (verify/decode)', () => {
    expect(() => jwtManager.verify('not-a-jwt')).toThrow('Invalid token format');
    expect(() => jwtManager.decode('not-a-jwt')).toThrow('Invalid token format');
  });

  it('should fail verification when token is not yet valid (nbf in future)', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwtManager.sign({ nbf: now + 60 });

    expect(() => jwtManager.verify(token)).toThrow(
      'Token verification failed: Token not yet valid'
    );
  });

  it('should ignore null option values when building claims', () => {
    const token = jwtManager.sign(
      {},
      {
        expiresIn: null as unknown as number,
        issuer: null as unknown as string,
        audience: null as unknown as string,
        subject: null as unknown as string,
        jwtId: null as unknown as string,
      }
    );

    const decoded = jwtManager.verify(token);
    expect(decoded.exp).toBeUndefined();
    expect(decoded.iss).toBeUndefined();
    expect(decoded.aud).toBeUndefined();
    expect(decoded.sub).toBeUndefined();
    expect(decoded.jti).toBeUndefined();
  });

  it('should throw for unsupported algorithms on sign', () => {
    expect(() => jwtManager.sign({}, { algorithm: 'none' as unknown as 'HS256' })).toThrow(
      'Unsupported algorithm: none'
    );
  });

  it('should fail verification when RS256 public key is not configured', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const signer = JwtManager.create();
    signer.setRsaKeys(privateKey, publicKey);
    const token = signer.sign({ userId: 1 }, { algorithm: 'RS256' });

    const verifier = JwtManager.create();
    expect(() => verifier.verify(token, 'RS256')).toThrow(
      'Token verification failed: RSA public key not configured'
    );
  });

  it('should reject tokens when verifySignature falls back to false', () => {
    const header = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({ userId: 1 }));
    const signature = base64Url('sig');

    const token = `${header}.${payload}.${signature}`;
    expect(() => jwtManager.verify(token, 'none' as unknown as 'HS256')).toThrow(
      'Token verification failed: Invalid signature'
    );
  });

  it('should throw a helpful error when token payload is invalid JSON', () => {
    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64Url('not-json');
    const signature = base64Url('sig');

    const token = `${header}.${payload}.${signature}`;
    expect(() => jwtManager.decode(token)).toThrow(/Invalid token payload:/u);
  });

  it('generateJwtId: returns a 32-char hex string', () => {
    const id = jwtManager.generateJwtId();
    expect(id).toMatch(/^[0-9a-f]{32}$/u);
  });

  it('should fail verification when HMAC secret is missing during signature verification', () => {
    const token = jwtManager.sign({ userId: 1 }, { algorithm: 'HS256' });

    const verifier = JwtManager.create();
    expect(() => verifier.verify(token, 'HS256')).toThrow(
      'Token verification failed: HMAC secret not configured'
    );
  });

  it('signRsa: throws when private key is missing (direct call for coverage)', () => {
    const mgr = JwtManager.create();
    const direct = mgr as unknown as { signRsa: (message: string) => string };
    expect(() => direct.signRsa('msg')).toThrow('RSA private key not configured');
  });
});
