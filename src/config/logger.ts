/**
 * Logger utility - Central logging configuration
 * Sealed namespace pattern - all exports through Logger namespace
 * Replaces console.* calls throughout the codebase
 */
import { Env } from '@config/env';

interface ILogger {
  debug(message: string, data?: unknown, category?: string): void;
  info(message: string, data?: unknown, category?: string): void;
  warn(message: string, data?: unknown, category?: string): void;
  error(message: string, error?: unknown, category?: string): void;
  fatal(message: string, error?: unknown, category?: string): void;
}

const isDevelopment = Env.NODE_ENV === 'development' || Env.NODE_ENV === undefined;
const isProduction = Env.NODE_ENV === 'production';

/**
 * Helper to extract error message from unknown error type
 */
const getErrorMessage = (error?: unknown): string => {
  if (error === undefined) {
    return '';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

// Private helper functions
const logDebug = (message: string, data?: unknown, category?: string): void => {
  String(category);
  if (isDevelopment) {
    console.debug(`[DEBUG] ${message}`, data ?? ''); // eslint-disable-line no-console
  }
};

const logInfo = (message: string, data?: unknown, category?: string): void => {
  String(category);
  console.log(`[INFO] ${message}`, data ?? ''); // eslint-disable-line no-console
};

const logWarn = (message: string, data?: unknown, category?: string): void => {
  String(category);
  console.warn(`[WARN] ${message}`, data ?? ''); // eslint-disable-line no-console
};

const logError = (message: string, error?: unknown, category?: string): void => {
  const errorMessage = getErrorMessage(error);
  String(category);
  console.error(`[ERROR] ${message}`, errorMessage); // eslint-disable-line no-console
};

const logFatal = (message: string, error?: unknown, category?: string): void => {
  const errorMessage = getErrorMessage(error);
  String(category);
  console.error(`[FATAL] ${message}`, errorMessage); // eslint-disable-line no-console
  if (isProduction && typeof process !== 'undefined') {
    process.exit(1);
  }
};

const createLoggerScope = (scope: string): ILogger => {
  return {
    debug(message: string, data?: unknown): void {
      logDebug(`[${scope}] ${message}`, data, scope);
    },
    info(message: string, data?: unknown): void {
      logInfo(`[${scope}] ${message}`, data, scope);
    },
    warn(message: string, data?: unknown): void {
      logWarn(`[${scope}] ${message}`, data, scope);
    },
    error(message: string, error?: unknown): void {
      logError(`[${scope}] ${message}`, error, scope);
    },
    fatal(message: string, error?: unknown): void {
      logFatal(`[${scope}] ${message}`, error, scope);
    },
  };
};

// Sealed namespace with all logger functionality
export const Logger = Object.freeze({
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  fatal: logFatal,
  scope: createLoggerScope,
});

export default Logger;
