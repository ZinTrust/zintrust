/**
 * Http Client - Fluent HTTP request builder
 *
 * Usage:
 *   await HttpClient.get('https://api.example.com/users').withAuth(token).send();
 *   await HttpClient.post('https://api.example.com/users', data).withTimeout(5000).send();
 */

import { OpenTelemetry } from '@/observability/OpenTelemetry';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHttpResponse, type IHttpResponse } from '@httpClient/HttpResponse';

export type { IHttpResponse } from '@httpClient/HttpResponse';

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
  send(): Promise<IHttpResponse>;
}

/**
 * Internal request state
 */
type BodyInitLocal = string | ArrayBuffer | Blob | FormData | URLSearchParams;

interface RequestState {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: BodyInitLocal | null;
  timeout?: number;
  contentType?: 'json' | 'form';
}

/**
 * Perform the actual request for a given state. Separated to keep the builder small
 */
async function performRequest(state: RequestState): Promise<IHttpResponse> {
  const timeout = state.timeout ?? Env.getInt('HTTP_TIMEOUT', 30000);
  const controller = new AbortController();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout > 0) {
    timeoutId = globalThis.setTimeout(() => controller.abort(), timeout);
  }

  const buildInit = (): RequestInit => {
    if (OpenTelemetry.isEnabled()) {
      OpenTelemetry.injectTraceHeaders(state.headers);
    }

    const init: RequestInit = {
      method: state.method,
      headers: state.headers,
      signal: controller.signal,
    };

    if (
      state.body !== undefined &&
      state.body !== null &&
      ['POST', 'PUT', 'PATCH'].includes(state.method)
    ) {
      init.body = state.body;
    }

    return init;
  };

  try {
    const init = buildInit();
    const startTime = Date.now();
    const response = await globalThis.fetch(state.url, init);
    const responseBody = await response.text();
    const duration = Date.now() - startTime;

    Logger.debug(`HTTP ${state.method} ${state.url}`, {
      status: response.status,
      duration: `${duration}ms`,
      size: responseBody.length,
    });

    return createHttpResponse(response, responseBody);
  } catch (error) {
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
const createRequestBuilder = (
  method: string,
  url: string,
  initialBody?: Record<string, unknown> | null
): IHttpRequest => {
  const state: RequestState = {
    method,
    url,
    headers: {
      'User-Agent': 'ZinTrust/1.0',
    },
    body: initialBody ? JSON.stringify(initialBody) : undefined,
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

    async send(): Promise<IHttpResponse> {
      return performRequest(state);
    },
  };

  return self;
};

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
  post(url: string, data?: Record<string, unknown>): IHttpRequest {
    const builder = createRequestBuilder('POST', url, data);
    if (data) {
      builder.asJson();
    }
    return builder;
  },

  /**
   * Make PUT request
   */
  put(url: string, data?: Record<string, unknown>): IHttpRequest {
    const builder = createRequestBuilder('PUT', url, data);
    if (data) {
      builder.asJson();
    }
    return builder;
  },

  /**
   * Make PATCH request
   */
  patch(url: string, data?: Record<string, unknown>): IHttpRequest {
    const builder = createRequestBuilder('PATCH', url, data);
    if (data) {
      builder.asJson();
    }
    return builder;
  },

  /**
   * Make DELETE request
   */
  delete(url: string, data?: Record<string, unknown>): IHttpRequest {
    const builder = createRequestBuilder('DELETE', url, data);
    if (data) {
      builder.asJson();
    }
    return builder;
  },
});

export default HttpClient;
