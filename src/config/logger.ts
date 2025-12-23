/**
 * Logger utility - Central logging configuration
 * Sealed namespace pattern - all exports through Logger namespace
 * Replaces console.* calls throughout the codebase
 */

import { Logger as FileLogger } from '@cli/logger/Logger';
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

// Private helper functions
const logDebug = (message: string, data?: unknown, category?: string): void => {
  if (isDevelopment) {
    console.debug(`[DEBUG] ${message}`, data ?? ''); // eslint-disable-line no-console
  }
  FileLogger.debug(
    message,
    typeof data === 'object' ? (data as Record<string, unknown>) : { data },
    category
  );
};

const logInfo = (message: string, data?: unknown, category?: string): void => {
  console.log(`[INFO] ${message}`, data ?? ''); // eslint-disable-line no-console
  FileLogger.info(
    message,
    typeof data === 'object' ? (data as Record<string, unknown>) : { data },
    category
  );
};

const logWarn = (message: string, data?: unknown, category?: string): void => {
  console.warn(`[WARN] ${message}`, data ?? ''); // eslint-disable-line no-console
  FileLogger.warn(
    message,
    typeof data === 'object' ? (data as Record<string, unknown>) : { data },
    category
  );
};

const logError = (message: string, error?: unknown, category?: string): void => {
  const errorMessage =
    error === undefined ? '' : error instanceof Error ? error.message : String(error);
  if (errorMessage) {
    console.error(`[ERROR] ${message}`, errorMessage); // eslint-disable-line no-console
  } else {
    console.error(`[ERROR] ${message}`); // eslint-disable-line no-console
  }
  FileLogger.error(message, errorMessage ? { error: errorMessage } : {}, category);
};

const logFatal = (message: string, error?: unknown, category?: string): void => {
  const errorMessage =
    error === undefined ? '' : error instanceof Error ? error.message : String(error);
  if (errorMessage) {
    console.error(`[FATAL] ${message}`, errorMessage); // eslint-disable-line no-console
  } else {
    console.error(`[FATAL] ${message}`); // eslint-disable-line no-console
  }
  FileLogger.error(`FATAL: ${message}`, errorMessage ? { error: errorMessage } : {}, category);
  if (isProduction) {
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
