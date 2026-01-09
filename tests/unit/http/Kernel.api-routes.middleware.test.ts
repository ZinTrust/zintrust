import { ServiceContainer } from '@/container/ServiceContainer';
import { Kernel } from '@/http/Kernel';
import { Request } from '@/http/Request';
import { Response } from '@/http/Response';
import { Router } from '@/routing/Router';
import { JwtManager } from '@/security/JwtManager';
import type * as http from '@node-singletons/http';
import { registerRoutes } from '@routes/api';
import { describe, expect, it } from 'vitest';

type Headers = Record<string, string>;

type NodeResStub = {
  statusCode: number;
  writableEnded: boolean;
  setHeader: (name: string, value: string | string[]) => void;
  end: (data?: string | Buffer) => void;
};

const createNodeResStub = () => {
  const headers: Record<string, string | string[]> = {};
  let body = '';

  const raw: NodeResStub = {
    statusCode: 200,
    writableEnded: false,
    setHeader(name, value) {
      headers[name] = value;
    },
    end(data) {
      raw.writableEnded = true;
      if (data === undefined) return;
      body += Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    },
  };

  return { raw, headers, getBody: () => body };
};

const parseJsonBody = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

function cookiesFromSetCookieHeader(setCookie: unknown): Record<string, string> {
  const values: string[] = [];
  if (Array.isArray(setCookie)) {
    values.push(...setCookie.map(String));
  } else if (setCookie) {
    values.push(String(setCookie));
  }
  const result: Record<string, string> = {};

  for (const cookie of values) {
    const firstPart = cookie.split(';')[0] ?? '';
    const idx = firstPart.indexOf('=');
    if (idx <= 0) continue;
    const name = firstPart.slice(0, idx).trim();
    const value = firstPart.slice(idx + 1).trim();
    if (name !== '') result[name] = value;
  }

  return result;
}

async function runRequest(input: {
  method: string;
  path: string;
  headers?: Headers;
  body?: Record<string, unknown>;
}): Promise<{ status: number; headers: Record<string, string | string[]>; json: any }> {
  const router = Router.createRouter();
  registerRoutes(router);

  const kernel = Kernel.create(router, ServiceContainer.create());

  const nodeReq = {
    method: input.method,
    url: input.path,
    headers: input.headers ?? {},
  } as unknown as http.IncomingMessage;

  const nodeRes = createNodeResStub();

  const req = Request.create(nodeReq);
  if (input.body !== undefined) req.setBody(input.body);

  const res = Response.create(nodeRes.raw as unknown as http.ServerResponse);

  await kernel.handleRequest(req, res);

  return {
    status: nodeRes.raw.statusCode,
    headers: nodeRes.headers,
    json: parseJsonBody(nodeRes.getBody()),
  };
}

describe('Kernel + routes/api.ts middleware wiring', () => {
  it('GET /api/v1/profile blocks without Authorization', async () => {
    const r = await runRequest({ method: 'GET', path: '/api/v1/profile' });
    expect(r.status).toBe(401);
    expect(r.json).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it('GET /api/v1/profile succeeds with valid Bearer token', async () => {
    const jwt = JwtManager.create();
    jwt.setHmacSecret(process.env.JWT_SECRET ?? 'test-jwt-secret');
    const token = jwt.sign({ sub: '123' }, { algorithm: 'HS256' });

    const r = await runRequest({
      method: 'GET',
      path: '/api/v1/profile',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(r.status).toBe(200);
    expect(r.json).toEqual(expect.objectContaining({ message: 'Get user profile' }));
  });

  it('POST /api/v1/auth/register returns 422 for invalid body (with CSRF satisfied)', async () => {
    // 1) Call a safe GET first to receive session + CSRF cookies.
    const warmup = await runRequest({ method: 'GET', path: '/api/v1/posts' });

    const cookies = cookiesFromSetCookieHeader(warmup.headers['Set-Cookie']);
    const sessionId = cookies['ZIN_SESSION_ID'];
    const csrfToken = cookies['XSRF-TOKEN'];

    expect(sessionId).toBeTruthy();
    expect(csrfToken).toBeTruthy();

    const cookieHeader = `ZIN_SESSION_ID=${sessionId}; XSRF-TOKEN=${csrfToken}`;

    // 2) POST with CSRF token present but missing required fields for validateRegister.
    const r = await runRequest({
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
