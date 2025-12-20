import { JwtManager, JwtPayload } from '@security/JwtManager';
import { beforeEach, describe, expect, it } from 'vitest';

describe('JwtManager', () => {
  let manager: JwtManager;
  const secret = 'test-secret-key-for-hmac-256';

  beforeEach(() => {
    manager = new JwtManager();
    manager.setHmacSecret(secret);
  });

  it('HS256: should sign and verify token', () => {
    const payload = { sub: 'user-1', name: 'John' };
    const token = manager.sign(payload, { algorithm: 'HS256' });

    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);
  });

  it('HS256: should verify valid token', () => {
    const payload = { sub: 'user-1', name: 'John' };
    const token = manager.sign(payload, { algorithm: 'HS256' });

    const decoded = manager.verify(token, 'HS256');
    expect(decoded.sub).toBe('user-1');
    expect(decoded['name']).toBe('John');
  });

  it('HS256: should reject tampered token', () => {
    const payload = { sub: 'user-1' };
    const token = manager.sign(payload, { algorithm: 'HS256' });
    const tampered = token.slice(0, -5) + 'xxxxx';

    expect(() => manager.verify(tampered, 'HS256')).toThrow();
  });

  it('HS256: should add issued at claim', () => {
    const payload = { sub: 'user-1' };
    const token = manager.sign(payload, { algorithm: 'HS256' });

    const decoded = manager.verify(token, 'HS256');
    expect(decoded.iat).toBeDefined();
    expect(typeof decoded.iat).toBe('number');
  });

  it('HS256: should add expiration claim', () => {
    const payload = { sub: 'user-1' };
    const token = manager.sign(payload, { algorithm: 'HS256', expiresIn: 3600 });

    const decoded = manager.verify(token, 'HS256');
    expect(decoded.exp).toBeDefined();
    expect((decoded?.exp ?? 0) > Math.floor(Date.now() / 1000)).toBe(true);
  });

  it('HS256: should reject expired token', async () => {
    const payload = { sub: 'user-1' };
    const token = manager.sign(payload, { algorithm: 'HS256', expiresIn: 1 });

    // Wait for token to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const verifyOp = (): JwtPayload => manager.verify(token, 'HS256');
    expect(verifyOp).toThrow('Token expired');
  });

  it('HS256: should add custom claims', () => {
    const payload = { sub: 'user-1' };
    const token = manager.sign(payload, {
      algorithm: 'HS256',
      issuer: 'myapp',
      audience: 'api',
      subject: 'user-1',
    });

    const decoded = manager.verify(token, 'HS256');
    expect(decoded.iss).toBe('myapp');
    expect(decoded.aud).toBe('api');
    expect(decoded.sub).toBe('user-1');
  });

  it('HS256: should add JWT ID', () => {
    const payload = { sub: 'user-1' };
    const jti = manager.generateJwtId();
    const token = manager.sign(payload, { algorithm: 'HS256', jwtId: jti });

    const decoded = manager.verify(token, 'HS256');
    expect(decoded.jti).toBe(jti);
  });

  it('HS512: should sign with HS512', () => {
    const payload = { sub: 'user-1' };
    const token = manager.sign(payload, { algorithm: 'HS512' });

    const decoded = manager.verify(token, 'HS512');
    expect(decoded.sub).toBe('user-1');
  });

  it('Payload: should handle complex payloads', () => {
    const payload = {
      sub: 'user-1',
      name: 'John',
      email: 'john@example.com',
      roles: ['admin', 'user'],
      metadata: { theme: 'dark' },
    };
    const token = manager.sign(payload, { algorithm: 'HS256' });

    const decoded = manager.verify(token, 'HS256');
    expect(decoded.sub).toBe('user-1');
    expect(decoded['name']).toBe('John');
    expect(decoded['email']).toBe('john@example.com');
    expect(decoded['roles']).toEqual(['admin', 'user']);
    expect(decoded['metadata']).toEqual({ theme: 'dark' });
  });
});
