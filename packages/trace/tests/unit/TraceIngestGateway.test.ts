import { describe, expect, it, vi } from 'vitest';

import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { Router } from '@/routes/Router';
import { SignedRequest } from '@/security/SignedRequest';
import type { ITraceEntry } from '../../src/types';
import { TraceIngestGateway } from '../../src/ingest/TraceIngestGateway';

type JsonRecord = Record<string, unknown>;

const BASE_PATH = '/zin/trace/write';

const createRequest = (
  path: string,
  body: JsonRecord,
  headers: Record<string, string>
): IRequest => {
  const request = {
    body,
    context: { rawBodyText: JSON.stringify(body) },
    getBody: () => body,
    getHeaders: () => headers,
    getMethod: () => 'POST',
    getPath: () => path,
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
      return {} as never;
    },
    locals: {},
  };

  return { response: response as unknown as IResponse, state };
};

const signBody = async (
  path: string,
  body: JsonRecord,
  keyId: string,
  secret: string,
  nonce: string
): Promise<Record<string, string>> => {
  return SignedRequest.createHeaders({
    method: 'POST',
    url: new URL(path, 'http://localhost'),
    body: JSON.stringify(body),
    keyId,
    secret,
    nonce,
    timestampMs: 1_700_000_000_000,
  });
};

const getRouteHandler = (path: string) => {
  const router = Router.createRouter();
  const storage = {
    writeEntry: vi.fn(async () => undefined),
    updateEntry: vi.fn(async () => undefined),
    markFamilyStale: vi.fn(async () => undefined),
    queryEntries: vi.fn(),
    getEntry: vi.fn(),
    getBatch: vi.fn(),
    queryBatchEntries: vi.fn(),
    prune: vi.fn(),
    clear: vi.fn(),
    getMonitoring: vi.fn(),
    addMonitoring: vi.fn(),
    removeMonitoring: vi.fn(),
    stats: vi.fn(),
  };

  TraceIngestGateway.create({
    basePath: BASE_PATH,
    keyId: 'trace-key',
    secret: 'trace-secret',
    signingWindowMs: 600000000000,
    storage: storage as never,
  }).registerRoutes(router as never);

  const route = router.routes.find((item) => item.method === 'POST' && item.path === path);
  if (!route) throw new Error(`Trace ingest route not registered for ${path}`);

  return { handler: route.handler, storage };
};

describe('TraceIngestGateway', () => {
  it('accepts signed trace write requests and persists the entry', async () => {
    const entry: ITraceEntry = {
      uuid: 'uuid-1',
      batchId: 'batch-1',
      type: 'log',
      content: { message: 'hello trace proxy' },
      tags: ['service-a'],
      isLatest: true,
      createdAt: 1,
    };

    const body = { entry };
    const headers = await signBody(BASE_PATH, body, 'trace-key', 'trace-secret', 'nonce-1');
    const req = createRequest(BASE_PATH, body, headers);
    const { response, state } = createResponse();
    const { handler, storage } = getRouteHandler(BASE_PATH);

    await handler(req, response);

    expect(storage.writeEntry).toHaveBeenCalledWith(entry);
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ ok: true });
  });

  it('rejects invalid signatures', async () => {
    const body = {
      entry: {
        uuid: 'uuid-2',
        batchId: 'batch-2',
        type: 'log',
        content: { message: 'bad sig' },
        tags: [],
        isLatest: true,
        createdAt: 2,
      },
    };

    const headers = await signBody(BASE_PATH, body, 'trace-key', 'trace-secret', 'nonce-bad');
    headers['x-zt-signature'] = '0'.repeat(64);

    const req = createRequest(BASE_PATH, body, headers);
    const { response, state } = createResponse();
    const { handler, storage } = getRouteHandler(BASE_PATH);

    await handler(req, response);

    expect(storage.writeEntry).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(403);
    expect(state.body).toMatchObject({
      ok: false,
      error: { code: 'INVALID_SIGNATURE' },
    });
  });
});
