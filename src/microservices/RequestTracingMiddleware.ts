import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import * as crypto from '@node-singletons/crypto';

// Middleware next function type
export type NextFunction = (error?: Error) => void | Promise<void>;

export interface MNextFunction {
  middleware(
    serviceName: string,
    enabled?: boolean,
    samplingRate?: number
  ): (req: IRequest, res: IResponse, next: NextFunction) => void | Promise<void>;
  injectHeaders(
    serviceName: string,
    _targetServiceName: string
  ): (headers: Record<string, string>, traceId?: string) => Record<string, string>;
}

/**
 * Request trace metadata
 */
export interface TraceContext {
  traceId: string;
  parentServiceId?: string;
  depth: number;
  startTime: number;
  serviceName: string;
}

export interface ITraceLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/**
 * Trace logger for structured logging
 */
export const TraceLogger = Object.freeze({
  /**
   * Create a new trace logger instance
   */
  create(traceId: string, serviceName: string): ITraceLogger {
    return {
      info(message: string, data?: Record<string, unknown>): void {
        Logger.info(`[${traceId}] ${serviceName} INFO: ${message}`, data ?? '');
      },

      warn(message: string, data?: Record<string, unknown>): void {
        Logger.warn(`[${traceId}] ${serviceName} WARN: ${message}`, data ?? '');
      },

      error(message: string, data?: Record<string, unknown>): void {
        Logger.error(`[${traceId}] ${serviceName} ERROR: ${message}`, data ?? '');
      },

      debug(message: string, data?: Record<string, unknown>): void {
        if (Env.get('DEBUG') !== undefined && Env.get('DEBUG') !== '') {
          Logger.debug(`[${traceId}] ${serviceName} DEBUG: ${message}`, data ?? '');
        }
      },
    };
  },
});

/**
 * Generate unique trace ID
 */
function generateTraceId(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function shouldSampleRequest(samplingRate: number): boolean {
  if (samplingRate >= 1) return true;
  if (samplingRate <= 0) return false;

  const scale = 1_000_000;
  const value = crypto.randomInt(0, scale) / scale;
  return value <= samplingRate;
}

function createTracingMiddleware(
  serviceName: string,
  enabled: boolean,
  samplingRate: number
): (req: IRequest, res: IResponse, next: NextFunction) => void | Promise<void> {
  return async (req: IRequest, res: IResponse, next: NextFunction) => {
    if (enabled === false || shouldSampleRequest(samplingRate) === false) {
      return next();
    }

    // Check for existing trace ID (from parent service)
    const traceIdHeader = req.getHeader('x-trace-id');
    const traceId = (typeof traceIdHeader === 'string' ? traceIdHeader : '') || generateTraceId();

    const parentServiceIdHeader = req.getHeader('x-parent-service-id');
    const parentServiceId =
      typeof parentServiceIdHeader === 'string' ? parentServiceIdHeader : undefined;

    const depthHeader = req.getHeader('x-trace-depth');
    const depth = Number.parseInt((typeof depthHeader === 'string' ? depthHeader : '') || '0');

    // Store trace context in request
    const traceContext: TraceContext = {
      traceId,
      parentServiceId,
      depth,
      startTime: Date.now(),
      serviceName,
    };

    req.context = Object.keys(req.context).length > 0 ? req.context : {};
    req.context['trace'] = traceContext;
    req.context['traceLogger'] = TraceLogger.create(traceId, serviceName);

    // Attach trace headers to response
    res.setHeader('x-trace-id', traceId);
    res.setHeader('x-trace-service', serviceName);
    res.setHeader('x-trace-depth', depth.toString());

    // Log request start
    const method = req.getMethod();
    const path = req.getPath();
    Logger.info(
      `[TRACE ${traceId}] ${serviceName} ${method} ${path} (depth: ${depth}) ` +
        (parentServiceId === undefined ? '' : `(from: ${parentServiceId})`)
    );

    // Track response timing
    const startTime = Date.now();
    const originalJson = res.json.bind(res);

    res.json = function (data: unknown): void {
      const duration = Date.now() - startTime;
      Logger.info(
        `[TRACE ${traceId}] ${serviceName} ${method} ${path} ${res.getStatus()} (${duration}ms)`
      );
      return originalJson(data);
    };

    await next();
  };
}

function createInjectHeaders(
  serviceName: string
): (headers: Record<string, string>, traceId?: string) => Record<string, string> {
  return (headers: Record<string, string> = {}, traceId?: string) => {
    const depthHeader = headers['x-trace-depth'];
    const newDepth = Number.parseInt(depthHeader ?? '0') + 1;

    return {
      ...headers,
      'x-trace-id': traceId ?? crypto.randomBytes(8).toString('hex'),
      'x-parent-service-id': serviceName,
      'x-trace-depth': newDepth.toString(),
    };
  };
}

/**
 * Request Tracing Middleware
 * Enables request tracking across microservices for debugging and observability
 */
export function RequestTracingMiddlewareFactory(): MNextFunction {
  return {
    /**
     * Middleware to add request tracing
     */
    middleware(
      serviceName: string,
      enabled: boolean = true,
      samplingRate: number = 1
    ): (req: IRequest, res: IResponse, next: NextFunction) => void | Promise<void> {
      return createTracingMiddleware(serviceName, enabled, samplingRate);
    },

    /**
     * Middleware to inject trace headers into outgoing service calls
     */
    injectHeaders(
      serviceName: string,
      _targetServiceName: string
    ): (headers: Record<string, string>, traceId?: string) => Record<string, string> {
      return createInjectHeaders(serviceName);
    },
  };
}

export const RequestTracingMiddleware: MNextFunction = RequestTracingMiddlewareFactory();

export const middleware = (
  serviceName: string,
  enabled: boolean = true,
  samplingRate: number = 1
): ((req: IRequest, res: IResponse, next: NextFunction) => void | Promise<void>) =>
  RequestTracingMiddleware.middleware(serviceName, enabled, samplingRate);

export default RequestTracingMiddleware;
