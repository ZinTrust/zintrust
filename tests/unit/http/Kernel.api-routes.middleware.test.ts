import { JwtManager } from '@/security/JwtManager';
import { registerRoutes } from '@routes/api';
import { describe, expect, it } from 'vitest';

import { JwtSessions } from '@/security/JwtSessions';
import { SignedRequest } from '@/security/SignedRequest';
import { TestEnvironment } from '@/testing/TestEnvironment';

const jwtSecret = 'test-jwt-secret';
process.env['JWT_SECRET'] = jwtSecret;
process.env['APP_KEY'] = process.env['APP_KEY'] ?? 'test-app-key';
process.env['BULLETPROOF_SIGNING_SECRET'] = 'test-signing-secret';

const env = TestEnvironment.create({ registerRoutes });

describe('Kernel + routes/api.ts middleware wiring', () => {
  it('GET /api/v1/profile blocks without Authorization', async () => {
    const r = await env.request({ method: 'GET', path: '/api/v1/profile' });
    expect(r.status).toBe(401);
    expect(r.json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'missing_authorization_header',
          message: 'Unauthorized',
        }),
      })
    );
  });

  it('GET /api/v1/profile blocks with JWT only (Bulletproof required)', async () => {
    const jwt = JwtManager.create();
    jwt.setHmacSecret(jwtSecret);
    const token = jwt.sign({ sub: '123' }, { algorithm: 'HS256' });

    const r = await env.request({
      method: 'GET',
      path: '/api/v1/profile',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(r.status).toBe(401);
    expect(r.json).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it('GET /api/v1/profile succeeds with valid Bearer token + signed-request headers', async () => {
    const jwt = JwtManager.create();
    jwt.setHmacSecret(jwtSecret);
    const token = jwt.sign({ sub: '123', deviceId: 'dev-123' }, { algorithm: 'HS256' });
    await JwtSessions.register(token);

    const url = new URL('http://localhost/api/v1/profile');
    const signed = await SignedRequest.createHeaders({
      method: 'GET',
      url,
      body: '',
      keyId: 'dev-123',
      secret: 'test-signing-secret',
    });

    const r = await env.request({
      method: 'GET',
      path: '/api/v1/profile',
      headers: {
        authorization: `Bearer ${token}`,
        'x-zt-device-id': 'dev-123',
        'x-zt-timezone': 'UTC',
        ...signed,
      },
    });

    expect(r.status).toBe(200);
    expect(r.json).toEqual(expect.objectContaining({ message: 'Get user profile' }));
  });

  it('POST /api/v1/auth/register returns 422 for invalid body (with CSRF satisfied)', async () => {
    // 1) Call a safe GET first to receive session + CSRF cookies.
    const warmup = await env.request({ method: 'GET', path: '/api/v1/posts' });

    const sessionId = warmup.cookies['ZIN_SESSION_ID'];
    const csrfToken = warmup.cookies['XSRF-TOKEN'];

    expect(sessionId).toBeTruthy();
    expect(csrfToken).toBeTruthy();

    const cookieHeader = `ZIN_SESSION_ID=${sessionId}; XSRF-TOKEN=${csrfToken}`;

    // 2) POST with CSRF token present but missing required fields for validateRegister.
    const r = await env.request({
      method: 'POST',
      path: '/api/v1/auth/register',
      headers: {
        cookie: cookieHeader,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      body: {},
    });

    expect(r.status).toBe(422);
    expect(r.json).toEqual(expect.objectContaining({ errors: expect.any(Object) }));
  });
});
