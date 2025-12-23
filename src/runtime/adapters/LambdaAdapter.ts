/**
 * Runtime adapter for AWS Lambda
 */
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import {
  AdapterConfig,
  ErrorResponse,
  HttpResponse,
  PlatformRequest,
  PlatformResponse,
  RuntimeAdapter,
} from '@runtime/RuntimeAdapter';
import {
  IncomingMessage,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'node:http';
import { Socket } from 'node:net';

/**
 * AWS Lambda adapter for API Gateway and ALB events
 * Converts Lambda events to standard HTTP format for Zintrust framework
 * Sealed namespace for immutability
 */
export const LambdaAdapter = Object.freeze({
  /**
   * Create a new Lambda adapter instance
   */
  create(config: AdapterConfig): RuntimeAdapter {
    const configuredLoggerProvided = config.logger !== undefined;
    const defaultLogger = configuredLoggerProvided ? undefined : createDefaultLogger();

    const adapter: RuntimeAdapter & {
      logger?: AdapterConfig['logger'];
      createMockHttpObjects?: typeof createMockHttpObjects;
    } = {
      platform: 'lambda',

      logger: config.logger,

      createMockHttpObjects,

      async handle(event: unknown, context?: unknown): Promise<PlatformResponse> {
        return handleLambdaRequest(adapter, config, event, context);
      },

      parseRequest(event: unknown): PlatformRequest {
        return parseLambdaRequest(event);
      },

      formatResponse(response: PlatformResponse): unknown {
        return formatLambdaResponse(response);
      },

      getLogger(): {
        debug(msg: string, data?: unknown): void;
        info(msg: string, data?: unknown): void;
        warn(msg: string, data?: unknown): void;
        error(msg: string, err?: Error): void;
      } {
        if (adapter.logger !== undefined) return adapter.logger;
        if (configuredLoggerProvided === true) return createFallbackLogger();
        return defaultLogger ?? createDefaultLogger();
      },

      supportsPersistentConnections(): boolean {
        // Lambda containers persist for warm invocations
        return true;
      },

      getEnvironment(): {
        nodeEnv: string;
        runtime: string;
        dbConnection: string;
        dbHost?: string;
        dbPort?: number;
        [key: string]: unknown;
      } {
        return {
          nodeEnv: Env.NODE_ENV,
          runtime: 'lambda',
          dbConnection: Env.DB_CONNECTION,
          dbHost: Env.DB_HOST,
          dbPort: Env.DB_PORT,
        };
      },
    };

    return adapter;
  },
});

/**
 * Handle Lambda request
 */
async function handleLambdaRequest(
  adapter: RuntimeAdapter & { createMockHttpObjects?: typeof createMockHttpObjects },
  config: AdapterConfig,
  event: unknown,
  _context?: unknown
): Promise<PlatformResponse> {
  try {
    const lambdaEvent = event as LambdaEvent;
    const request = adapter.parseRequest(event);

    // Create mock Node.js request/response objects
    const { req, res, responseData } = (adapter.createMockHttpObjects ?? createMockHttpObjects)(
      request
    );

    // Parse body
    const body = parseBody(lambdaEvent);

    // Set request timeout
    const timeout = config.timeout ?? 30000;
    const timeoutHandle = setTimeout(() => {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Gateway Timeout',
          statusCode: 504,
        })
      );
    }, timeout);

    try {
      // Process request through Zintrust handler
      await config.handler(req, res, body);
    } finally {
      clearTimeout(timeoutHandle);
    }

    // Extract response
    const response = HttpResponse.create();
    response.setStatus(responseData.statusCode);
    response.setHeaders(responseData.headers);
    response.setBody(responseData.body);

    adapter.getLogger().debug('Lambda request processed', {
      statusCode: response.statusCode,
      path: request.path,
      method: request.method,
    });

    return response.toResponse();
  } catch (error) {
    Logger.error('Lambda handler error', error as Error);
    const errorResponse = ErrorResponse.create(
      500,
      'Internal Server Error',
      Env.NODE_ENV === 'development' ? { message: (error as Error).message } : undefined
    );
    return errorResponse.toResponse();
  }
}

/**
 * Parse Lambda request
 */
function parseLambdaRequest(event: unknown): PlatformRequest {
  const lambdaEvent = event as LambdaEvent;

  // Support both API Gateway v1 and v2 formats, plus ALB
  const isV2 = 'requestContext' in lambdaEvent && 'http' in lambdaEvent.requestContext;
  const isAlb = 'requestContext' in lambdaEvent && 'elb' in lambdaEvent.requestContext;

  let requestData: {
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
    query: Record<string, string | string[]>;
    body: string | null;
    remoteAddr: string;
  };

  if (isV2 === true) {
    requestData = parseV2Request(lambdaEvent as LambdaEventV2);
  } else if (isAlb === true) {
    requestData = parseAlbRequest(lambdaEvent as LambdaEventAlb);
  } else {
    requestData = parseV1Request(lambdaEvent as LambdaEventV1);
  }

  return {
    method: requestData.method.toUpperCase(),
    path: requestData.path,
    headers: normalizeHeaders(requestData.headers),
    body: requestData.body === null ? null : Buffer.from(requestData.body),
    query: requestData.query,
    remoteAddr: requestData.remoteAddr,
  };
}

/**
 * Format Lambda response
 */
function formatLambdaResponse(response: PlatformResponse): unknown {
  // Lambda expects specific format
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body:
      typeof response.body === 'string' ? response.body : (response.body?.toString('utf-8') ?? ''),
    isBase64Encoded: response.isBase64Encoded ?? false,
  };
}

/**
 * Parse body from Lambda event
 */
function parseBody(event: LambdaEvent): Buffer | null {
  const body = event.body;
  if (body === null || body === undefined || body === '') return null;

  if (event.isBase64Encoded === true && typeof body === 'string') {
    return Buffer.from(body, 'base64');
  }

  return typeof body === 'string' ? Buffer.from(body, 'utf-8') : Buffer.from(body);
}

/**
 * Create mock Node.js request/response objects
 */
function createMockHttpObjects(request: PlatformRequest): {
  req: IncomingMessage;
  res: ServerResponse;
  responseData: {
    statusCode: number;
    headers: Record<string, string | string[]>;
    body: string | Buffer | null;
  };
} {
  const responseData = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' } as Record<string, string | string[]>,
    body: null as string | Buffer | null,
  };

  // Create mock request object
  const req = new IncomingMessage(null as unknown as Socket);
  req.method = request.method;
  req.url = request.path;
  req.headers = request.headers;
  (req as unknown as { remoteAddress: string }).remoteAddress =
    request.remoteAddr !== undefined && request.remoteAddr !== '' ? request.remoteAddr : '0.0.0.0';

  // Create mock response object
  const res = new ServerResponse(req);
  res.writeHead = function (
    statusCode: number,
    statusMessageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]
  ): ServerResponse {
    responseData.statusCode = statusCode;
    const headersObj =
      typeof statusMessageOrHeaders === 'object' ? statusMessageOrHeaders : headers;
    if (headersObj) {
      Object.assign(responseData.headers, headersObj);
    }
    return res;
  };

  res.end = function (chunk?: unknown, _encodingOrCb?: unknown, _cb?: unknown): ServerResponse {
    if (typeof chunk === 'function') {
      (chunk as () => void)();
    } else if (chunk !== null && chunk !== undefined) {
      responseData.body = chunk as string | Buffer;
    }
    return res;
  };

  res.write = function (chunk: string | Buffer): boolean {
    responseData.body = chunk;
    return true;
  };

  return { req, res, responseData };
}

/**
 * Get remote address for API Gateway v2
 */
function getRemoteAddrV2(event: LambdaEventV2, headers: Record<string, string | string[]>): string {
  if (event.requestContext.http.sourceIp !== '') {
    return event.requestContext.http.sourceIp;
  }
  const forwarded = headers['x-forwarded-for']?.toString().split(',')[0];
  if (forwarded !== undefined && forwarded !== '') {
    return forwarded;
  }
  return '0.0.0.0';
}

/**
 * Get remote address for ALB
 */
function getRemoteAddrAlb(headers: Record<string, string | string[]>): string {
  const forwarded = headers['x-forwarded-for']?.toString().split(',')[0];
  if (forwarded !== undefined && forwarded !== '') {
    return forwarded;
  }
  const realIp = headers['x-real-ip']?.toString();
  if (realIp !== undefined && realIp !== '') {
    return realIp;
  }
  return '0.0.0.0';
}

/**
 * Get remote address for API Gateway v1
 */
function getRemoteAddrV1(headers: Record<string, string | string[]>): string {
  const forwardedCap = headers['X-Forwarded-For']?.toString().split(',')[0];
  if (forwardedCap !== undefined && forwardedCap !== '') {
    return forwardedCap;
  }
  const forwarded = headers['x-forwarded-for']?.toString().split(',')[0];
  if (forwarded !== undefined && forwarded !== '') {
    return forwarded;
  }
  return '0.0.0.0';
}

/**
 * Parse API Gateway v2 request
 */
function parseV2Request(event: LambdaEventV2): {
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  body: string | null;
  remoteAddr: string;
} {
  const headers = event.headers ?? {};
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers,
    query: event.queryStringParameters ?? {},
    body: event.body ?? null,
    remoteAddr: getRemoteAddrV2(event, headers),
  };
}

/**
 * Parse ALB request
 */
function parseAlbRequest(event: LambdaEventAlb): {
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  body: string | null;
  remoteAddr: string;
} {
  const headers = event.headers ?? {};
  return {
    method: event.httpMethod,
    path: event.path,
    headers,
    query: event.queryStringParameters ?? {},
    body: event.body ?? null,
    remoteAddr: getRemoteAddrAlb(headers),
  };
}

/**
 * Parse API Gateway v1 request
 */
function parseV1Request(event: LambdaEventV1): {
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string | string[]>;
  body: string | null;
  remoteAddr: string;
} {
  const headers = event.headers ?? {};
  return {
    method: event.httpMethod,
    path: event.path,
    headers,
    query: event.queryStringParameters ?? {},
    body: event.body ?? null,
    remoteAddr: getRemoteAddrV1(headers),
  };
}

/**
 * Normalize headers to lowercase
 */
function normalizeHeaders(
  headers: Record<string, string | string[]>
): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

// Type definitions for Lambda events
interface LambdaEventV1 {
  httpMethod: string;
  path: string;
  headers: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface LambdaEventV2 {
  requestContext: {
    http: {
      method: string;
      sourceIp: string;
    };
  };
  rawPath: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface LambdaEventAlb {
  httpMethod: string;
  path: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext: {
    elb: {
      targetGroupArn: string;
    };
  };
}

type LambdaEvent = LambdaEventV1 | LambdaEventV2 | LambdaEventAlb;

function createDefaultLogger(): NonNullable<AdapterConfig['logger']> {
  return {
    debug: (msg: string, data?: unknown) =>
      Logger.debug(`[Lambda] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    info: (msg: string, data?: unknown) =>
      Logger.info(`[Lambda] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    warn: (msg: string, data?: unknown) =>
      Logger.warn(`[Lambda] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    error: (msg: string, err?: Error) => Logger.error(`[Lambda] ${msg}`, err?.message),
  };
}

function createFallbackLogger(): {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: Error): void;
} {
  return {
    debug: (msg: string) => Logger.debug(`[Lambda] ${msg}`),
    info: (msg: string) => Logger.info(`[Lambda] ${msg}`),
    warn: (msg: string) => Logger.warn(`[Lambda] ${msg}`),
    error: (msg: string, err?: Error) => Logger.error(`[Lambda] ${msg}`, err?.message),
  };
}
