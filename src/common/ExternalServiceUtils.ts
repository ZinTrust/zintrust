/**
 * Shared Utilities for External Service Drivers
 * Common patterns for API calls, environment variable reading, and error handling
 */

import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
export {
  parseJsonObjectEnv,
  readWorkersEnvString,
  readWorkersFallbackBool,
  readWorkersFallbackInt,
  readWorkersFallbackString,
} from '@common/EnvFallbackUtils';

export type TracedFetchTraceOptions = {
  source?: string;
};

type HeaderEntriesLike = { entries: () => IterableIterator<[string, string]> };
type HeadersInitLocal =
  | Headers
  | HeaderEntriesLike
  | Array<[string, string]>
  | Record<string, string | undefined>;
type BodyInitLocal = string | ArrayBuffer | ArrayBufferView | Blob | FormData | URLSearchParams;

const isHeaderEntriesLike = (value: unknown): value is HeaderEntriesLike => {
  return typeof value === 'object' && value !== null && 'entries' in value;
};

const isHeaderTuple = (value: unknown): value is [string, string] => {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
};

const isHeaderTupleArray = (value: unknown): value is Array<[string, string]> => {
  return Array.isArray(value) && value.every(isHeaderTuple);
};

const asHeadersInitLocal = (headers: RequestInit['headers']): HeadersInitLocal | undefined => {
  return headers as HeadersInitLocal | undefined;
};

const asBodyInitLocal = (body: RequestInit['body']): BodyInitLocal | null | undefined => {
  return body as BodyInitLocal | null | undefined;
};

const headersToRecord = (headers: HeadersInitLocal | undefined): Record<string, string> => {
  if (headers === undefined) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (isHeaderEntriesLike(headers)) {
    return Object.fromEntries(headers.entries());
  }
  if (isHeaderTupleArray(headers)) {
    return Object.fromEntries(headers);
  }
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
};

const bodyToTracePayload = (body: BodyInitLocal | null | undefined): unknown => {
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
  if (
    typeof FormData !== 'undefined' &&
    body instanceof FormData &&
    typeof body.entries === 'function'
  ) {
    return Array.from(body.entries()).map(([key, value]) => [key, String(value)]);
  }
  return '[stream]';
};

const captureResponseBody = async (response: Response): Promise<string | undefined> => {
  try {
    return await response.clone().text();
  } catch {
    return undefined;
  }
};

const emitTrace = async (
  url: string,
  options: RequestInit,
  trace: TracedFetchTraceOptions | undefined,
  duration: number,
  response?: Response,
  error?: unknown
): Promise<void> => {
  const responseBody = response ? await captureResponseBody(response) : undefined;
  let traceError: string | undefined;

  if (error instanceof Error) {
    traceError = error.message;
  } else if (error !== undefined) {
    traceError = String(error);
  }

  SystemTraceBridge.emitHttpClient({
    source: trace?.source,
    method: String(options.method ?? 'GET').toUpperCase(),
    url,
    requestHeaders: headersToRecord(asHeadersInitLocal(options.headers)),
    responseStatus: response?.status,
    duration,
    requestBody: bodyToTracePayload(asBodyInitLocal(options.body)),
    responseHeaders: headersToRecord(response?.headers),
    responseBody,
    error: traceError,
  });
};

/**
 * Environment variable reader with fallback support
 * Handles both Env.get() and process.env for maximum compatibility
 */
export const readEnvString = (key: string, fallback = ''): string => {
  const anyEnv = Env as { get?: (k: string, d?: string) => string; [key: string]: unknown };
  const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get(key, '') : '';
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv;
  }
  const getEnv = anyEnv[key];
  if (typeof getEnv === 'string' && getEnv.trim() !== '') {
    return getEnv;
  }
  if (typeof process !== 'undefined') {
    const raw = process.env?.[key];
    if (typeof raw === 'string') return raw;
  }
  return fallback;
};

/**
 * Validate required parameters for external service calls
 */
export const validateRequiredParams = (
  params: Record<string, unknown>,
  required: string[]
): void => {
  for (const param of required) {
    const value = params[param];
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.length === 0)
    ) {
      throw ErrorFactory.createValidationError(`${param} is required`);
    }
  }
};

/**
 * Create standardized API error response
 */
export const createApiError = (message: string, service: string): Error => {
  return ErrorFactory.createValidationError(`${service} API error: ${message}`);
};

export const tracedFetch = async (
  url: string,
  options: RequestInit,
  trace?: TracedFetchTraceOptions
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const response = await globalThis.fetch(url, options);
    await emitTrace(url, options, trace, Date.now() - startTime, response);
    return response;
  } catch (error) {
    await emitTrace(url, options, trace, Date.now() - startTime, undefined, error);
    throw error;
  }
};

/**
 * Common fetch wrapper with error handling
 */
export const safeFetch = async (
  url: string,
  options: RequestInit,
  trace?: TracedFetchTraceOptions
): Promise<Response> => {
  try {
    const response = await tracedFetch(url, options, trace);

    if (!response.ok) {
      throw ErrorFactory.createValidationError(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    throw ErrorFactory.createValidationError(
      error instanceof Error ? error.message : 'Unknown fetch error'
    );
  }
};

/**
 * Standard API response builder
 */
export const buildApiResponse = <T>(
  success: boolean,
  data?: T,
  error?: string
): { success: boolean; data?: T; error?: string } => {
  const response: { success: boolean; data?: T; error?: string } = { success };

  if (data !== undefined) {
    response.data = data;
  }

  if (error !== undefined) {
    response.error = error;
  }

  return response;
};

/**
 * Health check utilities
 */
export const HealthUtils = {
  /**
   * Get process uptime safely
   */
  getUptime(): number {
    return typeof process !== 'undefined' && typeof process.uptime === 'function'
      ? process.uptime()
      : 0;
  },

  /**
   * Get current timestamp
   */
  getTimestamp(): string {
    return new Date().toISOString();
  },

  /**
   * Check if in production
   */
  isProduction(environment: string): boolean {
    return environment === 'production';
  },

  /**
   * Build health response
   */
  buildHealthResponse(
    status: 'healthy' | 'unhealthy' | 'alive' | 'ready' | 'not_ready',
    environment: string,
    extra?: Record<string, unknown>
  ) {
    const base = {
      status,
      timestamp: HealthUtils.getTimestamp(),
      environment,
      ...extra,
    };

    return base;
  },

  /**
   * Build error health response
   */
  buildErrorResponse(
    status: 'unhealthy' | 'not_ready',
    environment: string,
    error: Error,
    extra?: Record<string, unknown>
  ) {
    const isProd = HealthUtils.isProduction(environment);

    return HealthUtils.buildHealthResponse(status, environment, {
      error: isProd ? 'Service unavailable' : error.message,
      ...extra,
    });
  },
};
