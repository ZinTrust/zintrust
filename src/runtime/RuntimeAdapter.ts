import type { IncomingMessage, ServerResponse } from '@node-singletons/http';

type Tbody = string | Buffer | null;

/**
 * Request body type for handlers
 */
export type IRequestBody = Buffer;

/**
 * HTTP request/response for serverless and edge platforms
 */
export interface PlatformRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  body?: Tbody;
  query?: Record<string, string | string[]>;
  remoteAddr?: string;
}

export interface PlatformResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body?: Tbody;
  isBase64Encoded?: boolean;
}

/**
 * RuntimeAdapter interface for platform-agnostic HTTP handling
 * Allows single codebase deployment to Lambda, Fargate, Cloudflare, Deno
 */
export interface RuntimeAdapter {
  /**
   * Platform identifier
   */
  platform: 'nodejs' | 'lambda' | 'fargate' | 'cloudflare' | 'deno';

  /**
   * Handle platform-specific request event
   * Convert to standard HTTP format, process, and normalize response
   */
  handle(event: unknown, context?: unknown): Promise<PlatformResponse>;

  /**
   * Convert platform event to standard PlatformRequest
   */
  parseRequest(event: unknown): PlatformRequest;

  /**
   * Convert Zintrust response to platform-specific format
   */
  formatResponse(response: PlatformResponse): unknown;

  /**
   * Get platform-specific logger for debugging
   */
  getLogger(): {
    debug(msg: string, data?: unknown): void;
    info(msg: string, data?: unknown): void;
    warn(msg: string, data?: unknown): void;
    error(msg: string, err?: Error): void;
  };

  /**
   * Check if platform supports persistent connections
   */
  supportsPersistentConnections(): boolean;

  /**
   * Get environment configuration object
   */
  getEnvironment(): {
    nodeEnv: string;
    runtime: string;
    dbConnection: string;
    dbHost?: string;
    dbPort?: number;
    [key: string]: unknown;
  };
}

/**
 * Request handler that processes HTTP requests through Zintrust framework
 */
export type ZintrustHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: Tbody
) => Promise<void>;

/**
 * Adapter configuration options
 */
export interface AdapterConfig {
  handler: ZintrustHandler;
  logger?: {
    debug(msg: string, data?: unknown): void;
    info(msg: string, data?: unknown): void;
    warn(msg: string, data?: unknown): void;
    error(msg: string, err?: Error): void;
  };
  timeout?: number; // Request timeout in ms
  maxBodySize?: number; // Max request body size in bytes
}

/**
 * Response wrapper for normalizing HTTP responses across platforms
 */
export interface IHttpResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Tbody;
  isBase64Encoded: boolean;
  setStatus(code: number): IHttpResponse;
  setHeader(key: string, value: string | string[]): IHttpResponse;
  setHeaders(headers: Record<string, string | string[]>): IHttpResponse;
  setBody(body: Tbody, isBase64?: boolean): IHttpResponse;
  setJSON(data: unknown): IHttpResponse;
  toResponse(): PlatformResponse;
}

export const HttpResponse = Object.freeze({
  create(): IHttpResponse {
    const state = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' } as Record<string, string | string[]>,
      body: null as Tbody,
      isBase64Encoded: false,
    };

    const self: IHttpResponse = {
      get statusCode() {
        return state.statusCode;
      },
      set statusCode(val: number) {
        state.statusCode = val;
      },
      get headers() {
        return state.headers;
      },
      set headers(val: Record<string, string | string[]>) {
        state.headers = val;
      },
      get body() {
        return state.body;
      },
      set body(val: Tbody) {
        state.body = val;
      },
      get isBase64Encoded() {
        return state.isBase64Encoded;
      },
      set isBase64Encoded(val: boolean) {
        state.isBase64Encoded = val;
      },

      setStatus(code: number): IHttpResponse {
        state.statusCode = code;
        return self;
      },

      setHeader(key: string, value: string | string[]): IHttpResponse {
        state.headers[key] = value;
        return self;
      },

      setHeaders(newHeaders: Record<string, string | string[]>): IHttpResponse {
        state.headers = { ...state.headers, ...newHeaders };
        return self;
      },

      setBody(newBody: Tbody, isBase64?: boolean): IHttpResponse {
        state.body = newBody;
        state.isBase64Encoded = isBase64 ?? false;
        return self;
      },

      setJSON(data: unknown): IHttpResponse {
        state.headers['Content-Type'] = 'application/json';
        state.body = JSON.stringify(data);
        state.isBase64Encoded = false;
        return self;
      },

      toResponse(): PlatformResponse {
        return {
          statusCode: state.statusCode,
          headers: state.headers,
          body: state.body ?? undefined,
          isBase64Encoded: state.isBase64Encoded,
        };
      },
    };

    return self;
  },
});

/**
 * Error response helper
 */
export const ErrorResponse = Object.freeze({
  create(statusCode: number, message: string, details?: unknown): IHttpResponse {
    const response = HttpResponse.create();
    response.setStatus(statusCode);
    response.setJSON({
      error: message,
      statusCode,
      timestamp: new Date().toISOString(),
      ...(details === undefined ? {} : { details }),
    });
    return response;
  },
});

/**
 * Create mock Node.js request/response objects for platform compatibility
 */
export function createMockHttpObjects(request: PlatformRequest): {
  req: Record<string, unknown>;
  res: Record<string, unknown>;
  responseData: {
    statusCode: number;
    headers: Record<string, string | string[]>;
    body: Tbody;
  };
} {
  const responseData = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' } as Record<string, string | string[]>,
    body: null as Tbody,
  };

  // Create minimal mock objects for compatibility
  const req = {
    method: request.method,
    url: request.path,
    headers: request.headers,
    remoteAddress: request.remoteAddr,
  };

  const res = {
    statusCode: 200,
    headers: responseData.headers,
    writeHead: function (statusCode: number, headers?: Record<string, string | string[]>): object {
      responseData.statusCode = statusCode;
      if (headers) {
        responseData.headers = { ...responseData.headers, ...headers };
      }
      return this;
    },
    setHeader: function (name: string, value: string): object {
      responseData.headers[name.toLowerCase()] = value;
      return this;
    },
    end: function (chunk?: string | Buffer): object {
      if (chunk !== undefined) {
        responseData.body = chunk;
      }
      return this;
    },
    write: function (chunk: string | Buffer): boolean {
      responseData.body = chunk;
      return true;
    },
  };

  return { req, res, responseData };
}
