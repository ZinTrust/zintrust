import { JwtManager } from '@/security/JwtManager';
import { registerRoutes } from '@routes/api';
import { describe, expect, it } from 'vitest';

import { TestEnvironment } from '@/testing/TestEnvironment';

const env = TestEnvironment.create({ registerRoutes });

describe('Kernel + routes/api.ts middleware wiring', () => {
  it('GET /api/v1/profile blocks without Authorization', async () => {
    const r = await env.request({ method: 'GET', path: '/api/v1/profile' });
    expect(r.status).toBe(401);
    expect(r.json).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it('GET /api/v1/profile succeeds with valid Bearer token', async () => {
    const jwt = JwtManager.create();
    jwt.setHmacSecret(process.env.JWT_SECRET ?? 'test-jwt-secret');
    const token = jwt.sign({ sub: '123' }, { algorithm: 'HS256' });

    const r = await env.request({
      method: 'GET',
      path: '/api/v1/profile',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(r.status).toBe(200);
    expect(r.json).toEqual(expect.objectContaining({ message: 'Get user profile' }));
  });

  it('POST /api/v1/auth/register returns 422 for invalid body (with CSRF satisfied)', async () => {
    // 1) Call a safe GET first to receive session + CSRF cookies.
    const warmup = await env.request({ method: 'GET', path: '/api/v1/posts' });

    // DEBUG: inspect warmup response to ensure cookies are set (temporary)
    // eslint-disable-next-line no-console
    console.debug('warmup.headers=', warmup.headers);
    // eslint-disable-next-line no-console
    console.debug('warmup.cookies=', warmup.cookies);

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
