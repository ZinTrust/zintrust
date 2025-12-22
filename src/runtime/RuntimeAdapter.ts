import { IncomingMessage, ServerResponse } from 'node:http';

type Tbody = string | Buffer | null;

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
  body: string | Buffer | null
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
export class HttpResponse {
  statusCode: number = 200;
  headers: Record<string, string | string[]> = {
    'Content-Type': 'application/json',
  };
  body: string | Buffer | null = null;
  isBase64Encoded: boolean = false;

  setStatus(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(key: string, value: string | string[]): this {
    this.headers[key] = value;
    return this;
  }

  setHeaders(headers: Record<string, string | string[]>): this {
    this.headers = { ...this.headers, ...headers };
    return this;
  }

  setBody(body: string | Buffer | null, isBase64?: boolean): this {
    this.body = body;
    this.isBase64Encoded = isBase64 ?? false;
    return this;
  }

  setJSON(data: unknown): this {
    this.setHeader('Content-Type', 'application/json');
    this.body = JSON.stringify(data);
    this.isBase64Encoded = false;
    return this;
  }

  toResponse(): PlatformResponse {
    return {
      statusCode: this.statusCode,
      headers: this.headers,
      body: this.body ?? undefined,
      isBase64Encoded: this.isBase64Encoded,
    };
  }
}

/**
 * Error response helper
 */
export class ErrorResponse extends HttpResponse {
  constructor(statusCode: number, message: string, details?: unknown) {
    super();
    this.setStatus(statusCode);
    this.setJSON({
      error: message,
      statusCode,
      timestamp: new Date().toISOString(),
      ...(details === undefined ? {} : { details }),
    });
  }
}
