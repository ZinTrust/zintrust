/**
 * Http Client - Fluent HTTP request builder
 *
 * Usage:
 *   await HttpClient.get('https://api.example.com/users').withAuth(token).send();
 *   await HttpClient.post('https://api.example.com/users', data).withTimeout(5000).send();
 */

import { OpenTelemetry } from '@/observability/OpenTelemetry';
import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isArray, isDate, isObject } from '@helper/index';
import { createHttpResponse, type IHttpResponse } from '@httpClient/HttpResponse';

export type { IHttpResponse } from '@httpClient/HttpResponse';

export type HttpRequestBody =
  | Record<string, unknown>
  | string
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | FormData
  | URLSearchParams;

export type HttpRequestCustomMode = Readonly<{
  contentType?: string;
  serializeBody?: (body: HttpRequestBody | null | undefined) => BodyInitLocal | null | undefined;
}>;

/**
 * HTTP Request builder interface
 */
export interface IHttpRequest {
  withHeader(name: string, value: string): IHttpRequest;
  withHeaders(headers: Record<string, string>): IHttpRequest;
  withAuth(token: string, scheme?: 'Bearer' | 'Basic'): IHttpRequest;
  withBasicAuth(username: string, password: string): IHttpRequest;
  withTimeout(ms: number): IHttpRequest;
  asJson(): IHttpRequest;
  asForm(): IHttpRequest;
  asCustom(mode: HttpRequestCustomMode): IHttpRequest;
  send(): Promise<IHttpResponse>;
  sendRaw(): Promise<Response>;
  sendStream(): Promise<{ response: Response; stream: ReadableStream<Uint8Array> | null }>;
}

/**
 * Internal request state
 */
type BodyInitLocal = NonNullable<RequestInit['body']>;

interface RequestState {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: HttpRequestBody | null;
  timeout?: number;
  contentType?: 'json' | 'form' | 'custom';
  customMode?: HttpRequestCustomMode;
}

const headersToRecord = (
  headers:
    | Headers
    | Map<string, string>
    | { entries?: () => IterableIterator<[string, string]> }
    | Record<string, string>
    | null
    | undefined
): Record<string, string> => {
  if (!headers) return {};

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (headers instanceof Map) {
    return Object.fromEntries(headers.entries());
  }

  if (typeof headers === 'object' && typeof headers.entries === 'function') {
    return Object.fromEntries(headers.entries());
  }

  if (typeof headers === 'object') {
    return Object.fromEntries(
      Object.entries(headers).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    );
  }

  return {};
};

const bodyToTracePayload = (body: HttpRequestBody | BodyInitLocal | null | undefined): unknown => {
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return Array.from(body.entries()).map(([key, value]) => [key, String(value)]);
  }
  if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
    return '[binary]';
  }
  if (isObject(body)) {
    return body;
  }
  return '[stream]';
};

const appendFormValue = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined || value === null) {
    return;
  }

  if (isArray(value)) {
    for (const item of value) {
      appendFormValue(params, key, item);
    }
    return;
  }

  if (isDate(value)) {
    params.append(key, value.toISOString());
    return;
  }

  if (isObject(value)) {
    params.append(key, JSON.stringify(value));
    return;
  }

  params.append(key, String(value));
};

const normalizeBodyInit = (body: BodyInitLocal | HttpRequestBody): BodyInitLocal => {
  if (ArrayBuffer.isView(body) && !(body instanceof DataView)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  return body as BodyInitLocal;
};

const serializeFormBody = (
  body: HttpRequestBody | null | undefined
): BodyInitLocal | null | undefined => {
  if (body === null || body === undefined) return body;
  if (typeof body === 'string' || body instanceof URLSearchParams) return body;
  if (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    (typeof FormData !== 'undefined' && body instanceof FormData)
  ) {
    return normalizeBodyInit(body);
  }
  if (isObject(body)) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      appendFormValue(params, key, value);
    }
    return params;
  }
  return body;
};

const serializeJsonBody = (
  body: HttpRequestBody | null | undefined
): BodyInitLocal | null | undefined => {
  if (body === null || body === undefined) return body;
  if (typeof body === 'string' || body instanceof URLSearchParams) return body;
  if (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    (typeof FormData !== 'undefined' && body instanceof FormData)
  ) {
    return normalizeBodyInit(body);
  }
  return JSON.stringify(body);
};

const serializeRequestBody = (state: RequestState): BodyInitLocal | null | undefined => {
  if (state.contentType === 'custom') {
    const customBody = state.customMode?.serializeBody?.(state.body);
    return customBody ?? serializeJsonBody(state.body);
  }
  if (state.contentType === 'form') {
    return serializeFormBody(state.body);
  }
  if (state.contentType === 'json') {
    return serializeJsonBody(state.body);
  }
  return serializeJsonBody(state.body);
};

const emitHttpClientTrace = (input: {
  state: RequestState;
  requestBody?: BodyInitLocal | null;
  durationMs: number;
  response?: Response;
  responseBody?: string;
  error?: string;
}): void => {
  const { state, requestBody, durationMs, response, responseBody, error } = input;

  SystemTraceBridge.emitHttpClient({
    source: 'http-client',
    method: state.method,
    url: state.url,
    requestHeaders: { ...state.headers },
    responseStatus: response?.status,
    duration: durationMs,
    requestBody: bodyToTracePayload(requestBody ?? state.body),
    responseHeaders: headersToRecord(response?.headers),
    responseBody,
    error,
  });
};

const captureTraceResponseBody = async (response: Response): Promise<string | undefined> => {
  try {
    return await response.clone().text();
  } catch {
    return undefined;
  }
};

/**
 * Perform the actual request for a given state. Separated to keep the builder small
 */
async function performRequest(state: RequestState): Promise<IHttpResponse> {
  const { response, bodyText, durationMs } = await performRequestRaw(state);

  Logger.debug(`HTTP ${state.method} ${state.url}`, {
    status: response.status,
    duration: `${durationMs}ms`,
    size: bodyText.length,
  });

  return createHttpResponse(response, bodyText);
}

async function performRequestRaw(state: RequestState): Promise<{
  response: Response;
  bodyText: string;
  durationMs: number;
  requestBody?: BodyInitLocal | null;
}> {
  const { response, durationMs, requestBody } = await performFetch(state);
  const bodyText = await response.text();
  emitHttpClientTrace({ state, requestBody, response, responseBody: bodyText, durationMs });
  return { response, bodyText, durationMs, requestBody };
}

async function performFetch(
  state: RequestState
): Promise<{ response: Response; durationMs: number; requestBody?: BodyInitLocal | null }> {
  const timeout = state.timeout ?? Env.getInt('HTTP_TIMEOUT', 30000);
  const controller = new AbortController();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout > 0) {
    timeoutId = globalThis.setTimeout(() => controller.abort(), timeout);
  }

  const buildInit = (): { init: RequestInit; requestBody?: BodyInitLocal | null } => {
    if (OpenTelemetry.isEnabled()) {
      OpenTelemetry.injectTraceHeaders(state.headers);
    }

    const requestBody = serializeRequestBody(state);

    const init: RequestInit = {
      method: state.method,
      headers: state.headers,
      signal: controller.signal,
    };

    if (
      requestBody !== undefined &&
      requestBody !== null &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(state.method)
    ) {
      init.body = requestBody;
    }

    return { init, requestBody };
  };

  const startTime = Date.now();

  try {
    const { init, requestBody } = buildInit();
    const response = await globalThis.fetch(state.url, init);
    const duration = Date.now() - startTime;
    return { response, durationMs: duration, requestBody };
  } catch (error) {
    const duration = Date.now() - startTime;
    emitHttpClientTrace({
      state,
      requestBody: serializeRequestBody(state),
      durationMs: duration,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.name === 'AbortError') {
      throw ErrorFactory.createConnectionError(`HTTP request timeout after ${timeout}ms`, {
        url: state.url,
        method: state.method,
        timeout,
      });
    }

    throw ErrorFactory.createTryCatchError(`HTTP request failed: ${(error as Error).message}`, {
      url: state.url,
      method: state.method,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

/**
 * Create request builder with fluent API
 */
function createRequestBuilder(
  method: string,
  url: string,
  initialBody?: HttpRequestBody | null
): IHttpRequest {
  const state: RequestState = {
    method,
    url,
    headers: {
      'User-Agent': 'ZinTrust/1.0',
    },
    body: initialBody ?? undefined,
  };

  const self: IHttpRequest = {
    withHeader(name: string, value: string): IHttpRequest {
      state.headers[name] = value;
      return self;
    },

    withHeaders(headers: Record<string, string>): IHttpRequest {
      Object.assign(state.headers, headers);
      return self;
    },

    withAuth(token: string, scheme: 'Bearer' | 'Basic' = 'Bearer'): IHttpRequest {
      state.headers['Authorization'] = `${scheme} ${token}`;
      return self;
    },

    withBasicAuth(username: string, password: string): IHttpRequest {
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      state.headers['Authorization'] = `Basic ${credentials}`;
      return self;
    },

    withTimeout(ms: number): IHttpRequest {
      state.timeout = ms;
      return self;
    },

    asJson(): IHttpRequest {
      state.contentType = 'json';
      state.headers['Content-Type'] = 'application/json';
      return self;
    },

    asForm(): IHttpRequest {
      state.contentType = 'form';
      state.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      return self;
    },

    asCustom(mode: HttpRequestCustomMode): IHttpRequest {
      state.contentType = 'custom';
      state.customMode = mode;

      if (typeof mode.contentType === 'string' && mode.contentType.trim() !== '') {
        state.headers['Content-Type'] = mode.contentType;
      }

      return self;
    },

    async send(): Promise<IHttpResponse> {
      return performRequest(state);
    },

    async sendRaw(): Promise<Response> {
      const { response, durationMs, requestBody } = await performFetch(state);
      const responseBody = await captureTraceResponseBody(response);
      emitHttpClientTrace({ state, requestBody, response, responseBody, durationMs });
      return response;
    },

    async sendStream(): Promise<{ response: Response; stream: ReadableStream<Uint8Array> | null }> {
      const { response, durationMs, requestBody } = await performFetch(state);
      const responseBody = await captureTraceResponseBody(response);
      emitHttpClientTrace({ state, requestBody, response, responseBody, durationMs });
      return { response, stream: response.body };
    },
  };

  return self;
}

/**
 * HTTP Client - Sealed namespace for making HTTP requests
 */
export const HttpClient = Object.freeze({
  /**
   * Make GET request
   */
  get(url: string): IHttpRequest {
    return createRequestBuilder('GET', url);
  },

  /**
   * Make POST request
   */
  post(url: string, data?: HttpRequestBody | null): IHttpRequest {
    const builder = createRequestBuilder('POST', url, data);
    if (isObject(data)) {
      builder.asJson();
    }
    return builder;
  },

  /**
   * Make PUT request
   */
  put(url: string, data?: HttpRequestBody | null): IHttpRequest {
    const builder = createRequestBuilder('PUT', url, data);
    if (isObject(data)) {
      builder.asJson();
    }
    return builder;
  },

  /**
   * Make PATCH request
   */
  patch(url: string, data?: HttpRequestBody | null): IHttpRequest {
    const builder = createRequestBuilder('PATCH', url, data);
    if (isObject(data)) {
      builder.asJson();
    }
    return builder;
  },

  /**
   * Make DELETE request
   */
  delete(url: string, data?: HttpRequestBody | null): IHttpRequest {
    const builder = createRequestBuilder('DELETE', url, data);
    if (isObject(data)) {
      builder.asJson();
    }
    return builder;
  },
});

export default HttpClient;
