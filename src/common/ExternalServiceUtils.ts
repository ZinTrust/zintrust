/**
 * Shared Utilities for External Service Drivers
 * Common patterns for API calls, environment variable reading, and error handling
 */

import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

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

/**
 * Common fetch wrapper with error handling
 */
export const safeFetch = async (url: string, options: RequestInit): Promise<Response> => {
  try {
    const response = await globalThis.fetch(url, options);

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
