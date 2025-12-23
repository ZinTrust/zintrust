/**
 * Runtime adapter for Cloudflare Workers
 */
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import {
  AdapterConfig,
  createMockHttpObjects,
  ErrorResponse,
  HttpResponse,
  PlatformRequest,
  PlatformResponse,
  RuntimeAdapter,
} from '@runtime/RuntimeAdapter';
import { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Cloudflare Workers adapter for Cloudflare's edge compute platform
 * Uses fetch API and handles D1 database, KV storage bindings
 * Sealed namespace for immutability
 */
export const CloudflareAdapter = Object.freeze({
  /**
   * Create a new Cloudflare adapter instance
   */
  create(config: AdapterConfig): RuntimeAdapter {
    const logger = config.logger || createDefaultLogger();

    return {
      platform: 'cloudflare',

      async handle(event: unknown): Promise<PlatformResponse> {
        return handleCloudflareRequest(this, config, logger, event);
      },

      parseRequest(event: CloudflareRequest): PlatformRequest {
        return parseCloudflareRequest(event);
      },

      formatResponse(response: PlatformResponse): Response {
        return formatCloudflareResponse(response);
      },

      getLogger(): {
        debug(msg: string, data?: unknown): void;
        info(msg: string, data?: unknown): void;
        warn(msg: string, data?: unknown): void;
        error(msg: string, err?: Error): void;
      } {
        return (
          logger || {
            debug: (msg: string) => Logger.debug(`[Cloudflare] ${msg}`),
            info: (msg: string) => Logger.info(`[Cloudflare] ${msg}`),
            warn: (msg: string) => Logger.warn(`[Cloudflare] ${msg}`),
            error: (msg: string, err?: Error) => Logger.error(`[Cloudflare] ${msg}`, err?.message),
          }
        );
      },

      supportsPersistentConnections(): boolean {
        // Cloudflare Workers isolates don't support persistent connections
        return false;
      },

      getEnvironment(): {
        nodeEnv: string;
        runtime: string;
        dbConnection: string;
        dbHost?: string;
        dbPort?: number;
        [key: string]: unknown;
      } {
        return getCloudflareEnvironment();
      },
    };
  },

  /**
   * Get D1 database binding
   * Usage: adapter.getD1Database()
   */
  getD1Database(): unknown {
    // @ts-ignore - Cloudflare Workers environment
    return globalThis.env?.DB ?? null;
  },

  /**
   * Get KV namespace binding for secrets/configuration
   * Usage: adapter.getKV('NAMESPACE_NAME')
   */
  getKV(namespace: string): unknown {
    // @ts-ignore - Cloudflare Workers environment
    return globalThis.env?.[namespace] ?? null;
  },
});

/**
 * Handle Cloudflare request
 */
async function handleCloudflareRequest(
  adapter: RuntimeAdapter,
  config: AdapterConfig,
  logger: AdapterConfig['logger'],
  event: unknown
): Promise<PlatformResponse> {
  try {
    const request = event as CloudflareRequest;

    // Parse incoming request
    const platformRequest = adapter.parseRequest(request);

    // Read request body
    const body =
      request.method !== 'GET' && request.method !== 'HEAD'
        ? Buffer.from(await request.text())
        : null;

    // Create mock Node.js request/response objects
    const { req, res, responseData } = createMockHttpObjects(platformRequest);

    // Set request timeout
    const timeout = config.timeout ?? 30000;
    const timeoutHandle = setTimeout(() => {
      responseData.statusCode = 504;
      responseData.body = JSON.stringify({
        error: 'Gateway Timeout',
        statusCode: 504,
      });
    }, timeout);

    try {
      // Process request through Zintrust handler
      await config.handler(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
        body
      );
    } finally {
      clearTimeout(timeoutHandle);
    }

    // Format response for Cloudflare
    const response = HttpResponse.create();
    response.setStatus(responseData.statusCode);
    response.setHeaders(responseData.headers);
    response.setBody(responseData.body);

    logger?.debug('Cloudflare request processed', {
      statusCode: response.statusCode,
      path: platformRequest.path,
    });

    return response.toResponse();
  } catch (error) {
    Logger.error('Cloudflare handler error', error as Error);
    const errorResponse = ErrorResponse.create(
      500,
      'Internal Server Error',
      Env.NODE_ENV === 'development' ? { message: (error as Error).message } : undefined
    );
    return errorResponse.toResponse();
  }
}

/**
 * Parse Cloudflare request
 */
function parseCloudflareRequest(event: CloudflareRequest): PlatformRequest {
  const url = new URL(event.url);
  const headers: Record<string, string | string[]> = {};

  // Convert Headers object to Record
  event.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    method: event.method.toUpperCase(),
    path: url.pathname,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
    remoteAddr: headers['cf-connecting-ip']?.toString() || '0.0.0.0',
  };
}

/**
 * Format Cloudflare response
 */
function formatCloudflareResponse(response: PlatformResponse): Response {
  // Convert to Cloudflare Response format
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v));
    } else {
      headers.set(key, value);
    }
  }

  const body =
    typeof response.body === 'string' ? response.body : (response.body?.toString('utf-8') ?? '');

  return new Response(body, {
    status: response.statusCode,
    headers,
  });
}

/**
 * Get Cloudflare environment
 */
function getCloudflareEnvironment(): {
  nodeEnv: string;
  runtime: string;
  dbConnection: string;
  dbHost?: string;
  dbPort?: number;
  [key: string]: unknown;
} {
  // @ts-ignore - Cloudflare Workers environment
  const env = globalThis.env ?? {};
  return {
    nodeEnv: env.ENVIRONMENT ?? 'production',
    runtime: 'cloudflare',
    dbConnection: env.DB_CONNECTION ?? 'd1', // D1 is Cloudflare's database
    dbHost: undefined, // D1 uses bindings, not host
    dbPort: undefined,
  };
}

/**
 * Cloudflare Worker Request type

 * Extends standard Web API Request with Cloudflare-specific properties
 */
export interface CloudflareRequest extends Request {
  url: string;
  method: string;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
  cf?: {
    colo?: string;
    country?: string;
    clientTcpRtt?: number;
    latitude?: string;
    longitude?: string;
    postalCode?: string;
    requestPriority?: string;
  };
}

function createDefaultLogger(): AdapterConfig['logger'] {
  return {
    debug: (msg: string, data?: unknown) =>
      Logger.debug(
        `[Cloudflare] ${msg}`,
        data !== undefined && data !== null ? JSON.stringify(data) : ''
      ),
    info: (msg: string, data?: unknown) =>
      Logger.info(
        `[Cloudflare] ${msg}`,
        data !== undefined && data !== null ? JSON.stringify(data) : ''
      ),
    warn: (msg: string, data?: unknown) =>
      Logger.warn(
        `[Cloudflare] ${msg}`,
        data !== undefined && data !== null ? JSON.stringify(data) : ''
      ),
    error: (msg: string, err?: Error) => Logger.error(`[Cloudflare] ${msg}`, err?.message),
  };
}
