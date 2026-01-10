import { Request, type IRequest, type ValidatedRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import type * as http from '@node-singletons/http';
import { vi } from 'vitest';

export type TestHttpRequestInput = {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  validated?: IRequest['validated'];
  context?: Record<string, unknown>;
};

export type TestHttpResponseRecorder = IResponse & {
  getBodyText: () => string;
  getJson: () => unknown;
  getHeaders: () => Record<string, string | string[]>;
};

const lowerCaseHeaders = (headers: Record<string, string> | undefined): Record<string, string> => {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
};

export const TestHttp = Object.freeze({
  createRequest(input: TestHttpRequestInput = {}): IRequest {
    const nodeReq = {
      method: input.method ?? 'GET',
      url: input.path ?? '/',
      headers: lowerCaseHeaders(input.headers),
    } as unknown as http.IncomingMessage;

    const req = Request.create(nodeReq);

    if (input.body !== undefined) req.setBody(input.body);
    if (input.params !== undefined) req.setParams(input.params);
    if (input.validated !== undefined) req.validated = input.validated;
    if (input.context !== undefined) req.context = input.context;

    return req;
  },

  createValidatedRequest<TBody = unknown, TQuery = unknown, TParams = unknown, THeaders = unknown>(
    input: Omit<TestHttpRequestInput, 'validated'> & {
      validated: {
        body: TBody;
        query: TQuery;
        params: TParams;
        headers: THeaders;
      };
    }
  ): ValidatedRequest<TBody, TQuery, TParams, THeaders> {
    const req = this.createRequest({
      ...input,
      validated: input.validated,
    });

    return req as unknown as ValidatedRequest<TBody, TQuery, TParams, THeaders>;
  },

  createResponseRecorder(): TestHttpResponseRecorder {
    let statusCodeValue = 200;
    let bodyText = '';
    let jsonBody: unknown;
    const headers: Record<string, string | string[]> = {};

    const raw = {
      statusCode: statusCodeValue,
      writableEnded: false,
      setHeader: (name: string, value: string | string[]) => {
        headers[name] = value;
      },
      end: (data?: string | Buffer) => {
        (raw as unknown as { writableEnded: boolean }).writableEnded = true;
        if (data === undefined) return;
        bodyText += Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      },
    } as unknown as http.ServerResponse;

    const res: TestHttpResponseRecorder = {
      locals: {},

      status: vi.fn((code: number) => res.setStatus(code)),
      setStatus: vi.fn((code: number) => {
        statusCodeValue = code;
        (raw as unknown as { statusCode: number }).statusCode = code;
        return res;
      }),
      getStatus: vi.fn(() => statusCodeValue),
      get statusCode() {
        return statusCodeValue;
      },

      setHeader: vi.fn((name: string, value: string | string[]) => {
        headers[name] = value;
        return res;
      }),
      getHeader: vi.fn((name: string) => headers[name]),

      json: vi.fn((data: unknown) => {
        jsonBody = data;
        bodyText = JSON.stringify(data);
      }),
      text: vi.fn((text: string) => {
        bodyText = text;
      }),
      html: vi.fn((html: string) => {
        bodyText = html;
      }),
      send: vi.fn((data: string | Buffer) => {
        bodyText = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      }),
      redirect: vi.fn((_url: string, code: number = 302) => {
        statusCodeValue = code;
      }),

      getRaw: vi.fn(() => raw),

      getBodyText: () => bodyText,
      getJson: () => jsonBody,
      getHeaders: () => ({ ...headers }),
    };

    return res;
  },
});
