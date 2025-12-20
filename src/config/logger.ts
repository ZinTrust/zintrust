/**
 * Logger utility - Central logging configuration
 * Replaces console.* calls throughout the codebase
 */

import { Env } from '@config/env';

const isDevelopment = Env.NODE_ENV === 'development' || Env.NODE_ENV === undefined;
const isProduction = Env.NODE_ENV === 'production';

/**
 * Log debug message
 */
export function logDebug(message: string, data?: unknown): void {
  if (isDevelopment) {
    console.debug(`[DEBUG] ${message}`, data ?? ''); // eslint-disable-line no-console
  }
}

/**
 * Log info message
 */
export function logInfo(message: string, data?: unknown): void {
  console.log(`[INFO] ${message}`, data ?? ''); // eslint-disable-line no-console
}

/**
 * Log warning message
 */
export function logWarn(message: string, data?: unknown): void {
  console.warn(`[WARN] ${message}`, data ?? ''); // eslint-disable-line no-console
}

/**
 * Log error message
 */
export function logError(message: string, error?: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[ERROR] ${message}`, errorMessage); // eslint-disable-line no-console
}

/**
 * Log fatal error and exit (production only)
 */
export function logFatal(message: string, error?: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[FATAL] ${message}`, errorMessage); // eslint-disable-line no-console
  if (isProduction) {
    process.exit(1);
  }
}

/**
 * Scoped logger for use in specific modules
 */
export class ScopedLogger {
  constructor(private readonly scope: string) {}

  debug(message: string, data?: unknown): void {
    logDebug(`[${this.scope}] ${message}`, data);
  }

  info(message: string, data?: unknown): void {
    logInfo(`[${this.scope}] ${message}`, data);
  }

  warn(message: string, data?: unknown): void {
    logWarn(`[${this.scope}] ${message}`, data);
  }

  error(message: string, error?: unknown): void {
    logError(`[${this.scope}] ${message}`, error);
  }

  fatal(message: string, error?: unknown): void {
    logFatal(`[${this.scope}] ${message}`, error);
  }
}

/**
 * Create scoped logger with prefix
 */
export function createLoggerScope(scope: string): ScopedLogger {
  return new ScopedLogger(scope);
}

/**
 * Logger utility - Central logging configuration
 * Replaces console.* calls throughout the codebase
 */
export const Logger = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  fatal: logFatal,
  scope: createLoggerScope,
};

export default Logger;
