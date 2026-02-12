import { describe, expect, it, vi } from 'vitest';

import { Env } from '@/config/env';
import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { Router } from '@/routes/Router';
import { SignedRequest } from '@/security/SignedRequest';
import BullMQRedisQueue from '../../../../packages/queue-redis/src/BullMQRedisQueue';
import { QueueHttpGateway } from '../../../../packages/queue-redis/src/QueueHttpGateway';

type JsonRecord = Record<string, unknown>;

const ROUTE_PATH = '/api/_sys/queue/rpc';

const createRequest = (body: JsonRecord, headers: Record<string, string>): IRequest => {
  const request = {
    body,
    context: { rawBodyText: JSON.stringify(body) },
    getBody: () => body,
    getHeaders: () => headers,
    getMethod: () => 'POST',
    getPath: () => ROUTE_PATH,
    getHeader: (name: string) => headers[name.toLowerCase()] ?? headers[name],
  };

  return request as unknown as IRequest;
};

const createResponse = (): {
  response: IResponse;
  state: { statusCode: number; body: unknown };
} => {
  const state = { statusCode: 200, body: undefined as unknown };

  const response = {
    status(code: number) {
      state.statusCode = code;
      return response;
    },
    setStatus(code: number) {
      state.statusCode = code;
      return response;
    },
    json(data: unknown) {
      state.body = data;
    },
    text(data: string) {
      state.body = data;
    },
    html(data: string) {
      state.body = data;
    },
    send(data: unknown) {
      state.body = data;
    },
    setHeader() {
      return response;
    },
    getHeader() {
      return undefined;
    },
    getStatus() {
      return state.statusCode;
    },
    statusCode: 200,
    redirect() {
      return undefined;
    },
    getRaw() {
      return {} as any;
    },
    locals: {},
  };

  return { response: response as unknown as IResponse, state };
};

const signBody = async (
  body: JsonRecord,
  keyId: string,
  secret: string,
  nonce: string
): Promise<Record<string, string>> => {
  const text = JSON.stringify(body);
  return SignedRequest.createHeaders({
    method: 'POST',
    url: new URL(ROUTE_PATH, 'http://localhost'),
    body: text,
    keyId,
    secret,
    nonce,
    timestampMs: 1_700_000_000_000,
  });
};

const getGatewayHandler = () => {
  const router = Router.createRouter();
  QueueHttpGateway.create().registerRoutes(router as any);
  const route = router.routes.find((item) => item.method === 'POST' && item.path === ROUTE_PATH);
  if (!route) throw new Error('Queue gateway route not registered');
  return route.handler;
};

describe('QueueHttpGateway', () => {
  it('accepts signed enqueue request and dispatches to BullMQ driver', async () => {
    Env.setSource({
      QUEUE_HTTP_PROXY_KEY_ID: 'gateway-key',
      QUEUE_HTTP_PROXY_KEY: 'gateway-secret',
      QUEUE_HTTP_PROXY_PATH: ROUTE_PATH,
      QUEUE_HTTP_PROXY_MAX_SKEW_MS: '600000000000',
    });

    const enqueueSpy = vi.spyOn(BullMQRedisQueue, 'enqueue').mockResolvedValue('job-777');

    try {
      const requestBody = {
        action: 'enqueue',
        requestId: 'req-1',
        payload: {
          queue: 'emails',
          payload: { hello: 'world' },
        },
      };

      const headers = await signBody(requestBody, 'gateway-key', 'gateway-secret', 'nonce-1');
      const req = createRequest(requestBody, headers);
      const { response, state } = createResponse();

      const handler = getGatewayHandler();
      await handler(req, response);

      expect(enqueueSpy).toHaveBeenCalledWith('emails', { hello: 'world' });
      expect(state.statusCode).toBe(200);
      expect(state.body).toMatchObject({ ok: true, requestId: 'req-1', result: 'job-777' });
    } finally {
      enqueueSpy.mockRestore();
      Env.setSource(null);
    }
  });

  it('rejects replayed nonce for same key', async () => {
    Env.setSource({
      QUEUE_HTTP_PROXY_KEY_ID: 'gateway-key',
      QUEUE_HTTP_PROXY_KEY: 'gateway-secret',
      QUEUE_HTTP_PROXY_PATH: ROUTE_PATH,
      QUEUE_HTTP_PROXY_MAX_SKEW_MS: '600000000000',
    });

    const lengthSpy = vi.spyOn(BullMQRedisQueue, 'length').mockResolvedValue(1);

    try {
      const requestBody = {
        action: 'length',
        requestId: 'req-replay',
        payload: {
          queue: 'emails',
        },
      };

      const headers = await signBody(requestBody, 'gateway-key', 'gateway-secret', 'nonce-replay');
      const handler = getGatewayHandler();

      const firstReq = createRequest(requestBody, headers);
      const firstRes = createResponse();
      await handler(firstReq, firstRes.response);
      expect(firstRes.state.statusCode).toBe(200);

      const secondReq = createRequest(requestBody, headers);
      const secondRes = createResponse();
      await handler(secondReq, secondRes.response);
      expect(secondRes.state.statusCode).toBe(401);
      expect(secondRes.state.body).toMatchObject({
        ok: false,
        requestId: 'req-replay',
        error: { code: 'REPLAYED' },
      });
    } finally {
      lengthSpy.mockRestore();
      Env.setSource(null);
    }
  });

  it('rejects invalid signature', async () => {
    Env.setSource({
      QUEUE_HTTP_PROXY_KEY_ID: 'gateway-key',
      QUEUE_HTTP_PROXY_KEY: 'gateway-secret',
      QUEUE_HTTP_PROXY_PATH: ROUTE_PATH,
      QUEUE_HTTP_PROXY_MAX_SKEW_MS: '600000000000',
    });

    try {
      const body = {
        action: 'drain',
        requestId: 'req-bad-sign',
        payload: { queue: 'emails' },
      };

      const headers = await signBody(body, 'gateway-key', 'gateway-secret', 'nonce-invalid');
      headers['x-zt-signature'] = '0'.repeat(64);

      const req = createRequest(body, headers);
      const { response, state } = createResponse();

      const handler = getGatewayHandler();
      await handler(req, response);

      expect(state.statusCode).toBe(403);
      expect(state.body).toMatchObject({
        ok: false,
        requestId: 'req-bad-sign',
        error: { code: 'INVALID_SIGNATURE' },
      });
    } finally {
      Env.setSource(null);
    }
  });
});
