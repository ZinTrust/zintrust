/**
 * Runtime adapter for Deno
 */
import Logger from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import {
  AdapterConfig,
  createMockHttpObjects,
  ErrorResponse,
  PlatformRequest,
  PlatformResponse,
  RuntimeAdapter,
} from '@runtime/RuntimeAdapter';

/**
 * Deno runtime adapter for Deno Deploy and edge compute environments
 * Sealed namespace for immutability
 */
export const DenoAdapter = Object.freeze({
  /**
   * Create a new Deno adapter instance
   */
  create(config: AdapterConfig): RuntimeAdapter & {
    startServer(port?: number, host?: string): Promise<void>;
  } {
    const logger = config.logger ?? createDefaultLogger();

    return {
      platform: 'deno',

      async handle(event: unknown, context?: unknown): Promise<PlatformResponse> {
        return handleDenoRequest(this, config, logger, event, context);
      },

      parseRequest(event: Request): PlatformRequest {
        return parseDenoRequest(event);
      },

      formatResponse(response: PlatformResponse): Response {
        return formatDenoResponse(response);
      },

      getLogger(): {
        debug(msg: string, data?: unknown): void;
        info(msg: string, data?: unknown): void;
        warn(msg: string, data?: unknown): void;
        error(msg: string, err?: Error): void;
      } {
        return logger && Object.keys(logger).length > 0
          ? logger
          : {
              debug: (msg: string) => Logger.debug(`[Deno] ${msg}`),
              info: (msg: string) => Logger.info(`[Deno] ${msg}`),
              warn: (msg: string) => Logger.warn(`[Deno] ${msg}`),
              error: (msg: string, err?: Error) => Logger.error(`[Deno] ${msg}`, err?.message),
            };
      },

      supportsPersistentConnections(): boolean {
        // Deno Deploy isolates are request-scoped
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
        return getDenoEnvironment();
      },

      async startServer(port: number = 3000, host: string = '0.0.0.0'): Promise<void> {
        return DenoAdapter.startServer(this as unknown as RuntimeAdapter, port, host);
      },
    };
  },

  /**
   * Start Deno server for continuous operation
   */
  async startServer(
    adapter: RuntimeAdapter,
    port: number = 3000,
    host: string = '0.0.0.0'
  ): Promise<void> {
    // @ts-ignore - Deno.serve is available in Deno runtime
    await Deno.serve({ port, hostname: host }, async (req: Request) => {
      const platformResponse = await adapter.handle(req);
      return adapter.formatResponse(platformResponse) as Response;
    });
  },

  /**
   * Get Deno KV store for caching/secrets
   */
  async getKV(): Promise<unknown> {
    // @ts-ignore - Deno.openKv is available in Deno runtime
    return await Deno.openKv?.();
  },

  /**
   * Get environment variable safely
   */
  getEnvVar(key: string, defaultValue?: string): string {
    // @ts-ignore - Deno.env is available in Deno runtime
    return Deno.env.get?.(key) ?? defaultValue ?? '';
  },

  /**
   * Check if running in Deno Deploy (edge)
   */
  isDeployEnvironment(): boolean {
    // @ts-ignore
    return typeof Deno !== 'undefined' && Deno.mainModule?.includes('denoDeploy');
  },
});

/**
 * Handle Deno request
 */
async function handleDenoRequest(
  adapter: RuntimeAdapter,
  config: AdapterConfig,
  logger: AdapterConfig['logger'],
  event: unknown,
  _context?: unknown
): Promise<PlatformResponse> {
  try {
    const denoRequest = event as Request;
    const request = adapter.parseRequest(denoRequest);

    // Read request body
    const body =
      denoRequest.method !== 'GET' && denoRequest.method !== 'HEAD'
        ? await denoRequest.arrayBuffer()
        : null;

    // Create mock Node.js request/response for compatibility
    const { res, responseData } = createMockHttpObjects(request);

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
      // Process through handler with mock Node.js objects
      // Note: In a real implementation, we'd use the handler from the adapter config
      // For compatibility with the existing code structure
      await config.handler(
        null as unknown as IncomingMessage,
        res as unknown as ServerResponse,
        body === null ? null : Buffer.from(body)
      );
    } finally {
      clearTimeout(timeoutHandle);
    }

    logger?.debug('Deno request processed', {
      statusCode: responseData.statusCode,
      path: request.path,
    });

    return responseData;
  } catch (error) {
    Logger.error('Deno handler error', error as Error);
    const errorResponse = ErrorResponse.create(
      500,
      'Internal Server Error',
      // @ts-ignore - Deno is available in Deno runtime
      typeof Deno !== 'undefined' && Deno.env.get('DENO_ENV') === 'development'
        ? { message: (error as Error).message }
        : undefined
    );
    return errorResponse.toResponse();
  }
}

/**
 * Parse Deno request
 */
function parseDenoRequest(event: Request): PlatformRequest {
  const url = new URL(event.url);
  const headers: Record<string, string | string[]> = {};

  // Convert Headers to Record
  event.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    method: event.method.toUpperCase(),
    path: url.pathname,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
    remoteAddr: headers['x-forwarded-for']?.toString().split(',')[0] ?? '0.0.0.0',
  };
}

/**
 * Format Deno response
 */
function formatDenoResponse(response: PlatformResponse): Response {
  // Convert to Deno Response format
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v));
    } else {
      headers.set(key, value);
    }
  }

  let body = '';
  if (typeof response.body === 'string') {
    body = response.body;
  } else if (response.body !== null && response.body !== undefined) {
    body = response.body.toString('utf-8');
  }

  return new Response(body, {
    status: response.statusCode,
    headers,
  });
}

/**
 * Get Deno environment
 */
function getDenoEnvironment(): {
  nodeEnv: string;
  runtime: string;
  dbConnection: string;
  dbHost?: string;
  dbPort?: number;
  [key: string]: unknown;
} {
  // @ts-ignore - Deno.env is available in Deno runtime
  const env = (typeof Deno === 'undefined' ? {} : (Deno.env.toObject?.() ?? {})) as Record<
    string,
    string
  >;
  return {
    nodeEnv: env['DENO_ENV'] ?? 'production',
    runtime: 'deno',
    dbConnection: env['DB_CONNECTION'] ?? 'postgresql',
    dbHost: env['DB_HOST'],
    dbPort: env['DB_PORT'] ? Number.parseInt(env['DB_PORT'], 10) : undefined,
  };
}

function createDefaultLogger(): AdapterConfig['logger'] {
  return {
    debug: (msg: string, data?: unknown) =>
      Logger.debug(`[Deno] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    info: (msg: string, data?: unknown) =>
      Logger.info(`[Deno] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    warn: (msg: string, data?: unknown) =>
      Logger.warn(`[Deno] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    error: (msg: string, err?: Error) => Logger.error(`[Deno] ${msg}`, err?.message),
  };
}
