import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import crypto from 'node:crypto';

// Middleware next function type
export type NextFunction = (error?: Error) => void | Promise<void>;

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

/**
 * Request Tracing Middleware
 * Enables request tracking across microservices for debugging and observability
 */

/**
 * Middleware to add request tracing
 */
export function middleware(
  serviceName: string,
  enabled: boolean = true,
  samplingRate: number = 1
): (req: Request, res: Response, next: NextFunction) => void | Promise<void> {
  return (req: Request, res: Response, next: NextFunction) => {
    if (enabled === false || Math.random() > samplingRate) {
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
    req.context ??= {};
    req.context['traceId'] = traceId;

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

    next();
  };
}

/**
 * Middleware to inject trace headers into outgoing service calls
 */
export function injectHeaders(
  serviceName: string,
  _targetServiceName: string
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
 * Generate unique trace ID
 */
function generateTraceId(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

export const RequestTracingMiddleware = {
  middleware,
  injectHeaders,
};

/**
 * Trace logger for structured logging
 */
export class TraceLogger {
  constructor(
    private readonly traceId: string,
    private readonly serviceName: string
  ) {}

  info(message: string, data?: Record<string, unknown>): void {
    Logger.info(`[${this.traceId}] ${this.serviceName} INFO: ${message}`, data ?? '');
  }

  warn(message: string, data?: Record<string, unknown>): void {
    Logger.warn(`[${this.traceId}] ${this.serviceName} WARN: ${message}`, data ?? '');
  }

  error(message: string, data?: Record<string, unknown>): void {
    Logger.error(`[${this.traceId}] ${this.serviceName} ERROR: ${message}`, data ?? '');
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (Env.get('DEBUG') !== undefined && Env.get('DEBUG') !== '') {
      Logger.debug(`[${this.traceId}] ${this.serviceName} DEBUG: ${message}`, data ?? '');
    }
  }
}

export default RequestTracingMiddleware;
