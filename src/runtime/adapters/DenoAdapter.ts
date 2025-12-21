/**
 * Runtime adapter for Deno
 */
import Logger from '@config/logger';
import {
  AdapterConfig,
  ErrorResponse,
  PlatformRequest,
  PlatformResponse,
  RuntimeAdapter,
} from '@runtime/RuntimeAdapter';

type EnvBody = string | Buffer | null;

interface MockResponse {
  writeHead: (statusCode: number, headers: Record<string, string | string[]>) => void;
  end: (body: EnvBody) => void;
  setHeader: (name: string, value: string | string[]) => void;
}

/**
 * Deno runtime adapter for Deno Deploy and edge compute environments
 * Uses Deno.serve() for HTTP handling and native Deno APIs
 */
export class DenoAdapter implements RuntimeAdapter {
  readonly platform = 'deno' as const;
  private readonly config: AdapterConfig;
  private readonly logger: AdapterConfig['logger'];

  constructor(config: AdapterConfig) {
    this.config = config;
    this.logger = config.logger || createDefaultLogger();
  }

  async handle(event: unknown, _context?: unknown): Promise<PlatformResponse> {
    try {
      const denoRequest = event as Request;
      const request = this.parseRequest(denoRequest);

      // Read request body
      const body =
        denoRequest.method !== 'GET' && denoRequest.method !== 'HEAD'
          ? await denoRequest.arrayBuffer()
          : null;

      // Create mock Node.js request/response for compatibility
      const { res, responseData } = this.createMockHttpObjects(request);

      // Set request timeout
      const timeout = this.config.timeout || 30000;
      const timeoutHandle = setTimeout(() => {
        responseData.statusCode = 504;
        responseData.body = JSON.stringify({
          error: 'Gateway Timeout',
          statusCode: 504,
        });
      }, timeout);

      try {
        // Process through handler with mock Node.js objects
        // In real scenario, handler would need to be adapted for Deno
        await this.processRequest(request, body, res);
      } finally {
        clearTimeout(timeoutHandle);
      }

      this.logger?.debug('Deno request processed', {
        statusCode: responseData.statusCode,
        path: request.path,
      });

      return responseData;
    } catch (error) {
      this.logger?.error('Deno handler error', error as Error);
      const errorResponse = new ErrorResponse(
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
   * Start Deno server for continuous operation
   */
  async startServer(port: number = 3000, host: string = '0.0.0.0'): Promise<void> {
    // @ts-ignore - Deno.serve is available in Deno runtime
    await Deno.serve({ port, hostname: host }, async (req: Request) => {
      const platformResponse = await this.handle(req);
      return this.formatResponse(platformResponse);
    });
  }

  parseRequest(event: Request): PlatformRequest {
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
      remoteAddr: headers['x-forwarded-for']?.toString().split(',')[0] || '0.0.0.0',
    };
  }

  formatResponse(response: PlatformResponse): Response {
    // Convert to Deno Response format
    const headers = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }

    const body =
      typeof response.body === 'string' ? response.body : response.body?.toString('utf-8') || '';

    return new Response(body, {
      status: response.statusCode,
      headers,
    });
  }

  getLogger(): {
    debug(msg: string, data?: unknown): void;
    info(msg: string, data?: unknown): void;
    warn(msg: string, data?: unknown): void;
    error(msg: string, err?: Error): void;
  } {
    return (
      this.logger || {
        debug: (msg: string) => Logger.debug(`[Deno] ${msg}`),
        info: (msg: string) => Logger.info(`[Deno] ${msg}`),
        warn: (msg: string) => Logger.warn(`[Deno] ${msg}`),
        error: (msg: string, err?: Error) => Logger.error(`[Deno] ${msg}`, err?.message),
      }
    );
  }

  supportsPersistentConnections(): boolean {
    // Deno Deploy isolates are request-scoped
    return false;
  }

  getEnvironment(): {
    nodeEnv: string;
    runtime: string;
    dbConnection: string;
    dbHost?: string;
    dbPort?: number;
    [key: string]: unknown;
  } {
    // @ts-ignore - Deno.env is available in Deno runtime
    const env = Deno.env.toObject?.() || {};
    return {
      nodeEnv: env.DENO_ENV || 'production',
      runtime: 'deno',
      dbConnection: env.DB_CONNECTION || 'postgresql',
      dbHost: env.DB_HOST,
      dbPort: env.DB_PORT ? Number.parseInt(env.DB_PORT, 10) : undefined,
    };
  }

  /**
   * Get Deno KV store for caching/secrets
   */
  async getKV(): Promise<unknown> {
    // @ts-ignore - Deno.openKv is available in Deno runtime
    return await Deno.openKv?.();
  }

  /**
   * Get environment variable safely
   */
  getEnvVar(key: string, defaultValue?: string): string {
    // @ts-ignore - Deno.env is available in Deno runtime
    return Deno.env.get?.(key) || defaultValue || '';
  }

  /**
   * Check if running in Deno Deploy (edge)
   */
  isDeployEnvironment(): boolean {
    // @ts-ignore
    return typeof Deno !== 'undefined' && Deno.mainModule?.includes('denoDeploy');
  }

  private async processRequest(
    request: PlatformRequest,
    _body: ArrayBuffer | null,
    res: MockResponse
  ): Promise<void> {
    // In real implementation, call the handler with mock Node.js objects
    // For now, just set response data
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', path: request.path }));
  }

  private createMockHttpObjects(request: PlatformRequest): {
    req: unknown;
    res: MockResponse;
    responseData: { statusCode: number; headers: Record<string, string | string[]>; body: EnvBody };
  } {
    const responseData = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' } as Record<string, string | string[]>,
      body: null as EnvBody,
    };

    const req = {
      method: request.method,
      url: request.path,
      headers: request.headers,
      remoteAddress: request.remoteAddr,
    };

    const res = {
      statusCode: 200,
      headers: responseData.headers,
      setHeader: function (key: string, value: string | string[]) {
        responseData.headers[key.toLowerCase()] = value;
        return this;
      },
      writeHead: function (statusCode: number, headers?: Record<string, string | string[]>) {
        responseData.statusCode = statusCode;
        if (headers) {
          responseData.headers = { ...responseData.headers, ...headers };
        }
        return this;
      },
      end: function (chunk: EnvBody) {
        if (chunk) {
          responseData.body = chunk;
        }
      },
      write: function (chunk: string | Buffer) {
        responseData.body = chunk;
        return true;
      },
    };

    return { req, res, responseData };
  }
}

function createDefaultLogger(): AdapterConfig['logger'] {
  return {
    debug: (msg: string, data?: unknown) =>
      Logger.debug(`[Deno] ${msg}`, data ? JSON.stringify(data) : ''),
    info: (msg: string, data?: unknown) =>
      Logger.info(`[Deno] ${msg}`, data ? JSON.stringify(data) : ''),
    warn: (msg: string, data?: unknown) =>
      Logger.warn(`[Deno] ${msg}`, data ? JSON.stringify(data) : ''),
    error: (msg: string, err?: Error) => Logger.error(`[Deno] ${msg}`, err?.message),
  };
}
