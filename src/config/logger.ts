/**
 * Logger utility - Central logging configuration
 * Sealed namespace pattern - all exports through Logger namespace
 * Replaces console.* calls throughout the codebase
 */
import { appConfig } from '@config/app';
import { Env } from '@config/env';

interface ILogger {
  debug(message: string, data?: unknown, category?: string): void;
  info(message: string, data?: unknown, category?: string): void;
  warn(message: string, data?: unknown, category?: string): void;
  error(message: string, error?: unknown, category?: string): void;
  fatal(message: string, error?: unknown, category?: string): void;
}

const isDevelopment = appConfig.isDevelopment();
const isProduction = appConfig.isProduction();

const LOG_FORMAT = Env.LOG_FORMAT;
const isJsonFormat = (value: unknown): value is 'json' => value === 'json';

const SENSITIVE_FIELDS = new Set<string>([
  'password',
  'token',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'jwt',
  'bearer',
]);

const redactSensitiveData = (data: unknown): unknown => {
  const seen = new WeakSet<object>();

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      return value.map((v) => walk(v));
    }

    if (typeof value === 'object' && value !== null) {
      const asObj = value as Record<string, unknown>;
      if (seen.has(asObj)) return '[Circular]';
      seen.add(asObj);

      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(asObj)) {
        if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
          out[key] = '[REDACTED]';
        } else {
          out[key] = walk(inner);
        }
      }
      return out;
    }

    return value;
  };

  return walk(data);
};

const safeStringify = (obj: unknown, indent: boolean = false): string => {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    obj,
    (_key: string, value: unknown) => {
      if (typeof value === 'object' && value !== null) {
        const asObj = value;
        if (seen.has(asObj)) return '[Circular]';
        seen.add(asObj);
      }
      return value;
    },
    indent ? 2 : 0
  );
};

type FileWriterModule = { FileLogWriter: { write: (line: string) => void } };

let fileWriterPromise: Promise<FileWriterModule> | undefined;
let fileWriter: FileWriterModule['FileLogWriter'] | undefined;

const getFileWriter = (): void => {
  if (fileWriter !== undefined) return;
  if (fileWriterPromise !== undefined) return;
  fileWriterPromise = import('@config/FileLogWriter')
    .then((mod) => {
      fileWriter = mod.FileLogWriter;
      return mod;
    })
    .catch(() => {
      fileWriterPromise = undefined;
      return { FileLogWriter: { write: (_line: string) => undefined } };
    });
};

const shouldLogToFile = (): boolean => {
  // Prefer dynamic lookup so late-bound env (tests, some runtimes) is respected.
  if (!Env.getBool('LOG_TO_FILE', false)) return false;
  if (typeof process === 'undefined') return false;
  return true;
};

const buildFileLine = (params: {
  formatted: string;
  data?: unknown;
  errorMessage?: string;
}): string => {
  if (isJsonFormat(LOG_FORMAT)) return params.formatted;

  let line = params.formatted;
  if (typeof params.errorMessage === 'string' && params.errorMessage.length > 0) {
    line = `${line} ${params.errorMessage}`;
  } else if (params.data !== undefined && params.data !== '') {
    line = `${line} ${safeStringify(redactSensitiveData(params.data))}`;
  }
  return line;
};

const writeToFile = (line: string): void => {
  if (!shouldLogToFile()) return;

  if (fileWriter !== undefined) {
    fileWriter.write(line);
    return;
  }

  getFileWriter();
  fileWriterPromise?.then((mod) => mod.FileLogWriter.write(line));
};

const formatLogMessage = (params: {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  data?: unknown;
  category?: string;
  errorMessage?: string;
}): string => {
  if (isJsonFormat(LOG_FORMAT)) {
    return safeStringify({
      timestamp: new Date().toISOString(),
      level: params.level,
      message: params.message,
      category: params.category,
      data: redactSensitiveData(params.data),
      error: params.errorMessage,
    });
  }

  // text format
  return `[${params.level.toUpperCase()}] ${params.message}`;
};

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
    const out = formatLogMessage({ level: 'debug', message, data, category });
    writeToFile(buildFileLine({ formatted: out, data }));
    if (isJsonFormat(LOG_FORMAT)) {
      console.debug(out); // eslint-disable-line no-console
      return;
    }
    console.debug(out, data ?? ''); // eslint-disable-line no-console
  }
};

const logInfo = (message: string, data?: unknown, category?: string): void => {
  String(category);
  const out = formatLogMessage({ level: 'info', message, data, category });
  writeToFile(buildFileLine({ formatted: out, data }));
  if (isJsonFormat(LOG_FORMAT)) {
    console.log(out); // eslint-disable-line no-console
    return;
  }
  console.log(out, data ?? ''); // eslint-disable-line no-console
};

const logWarn = (message: string, data?: unknown, category?: string): void => {
  String(category);
  const out = formatLogMessage({ level: 'warn', message, data, category });
  writeToFile(buildFileLine({ formatted: out, data }));
  if (isJsonFormat(LOG_FORMAT)) {
    console.warn(out); // eslint-disable-line no-console
    return;
  }
  console.warn(out, data ?? ''); // eslint-disable-line no-console
};

const logError = (message: string, error?: unknown, category?: string): void => {
  const errorMessage = getErrorMessage(error);
  String(category);
  const out = formatLogMessage({
    level: 'error',
    message,
    category,
    errorMessage,
  });
  writeToFile(buildFileLine({ formatted: out, errorMessage }));
  if (isJsonFormat(LOG_FORMAT)) {
    console.error(out); // eslint-disable-line no-console
    return;
  }
  console.error(out, errorMessage); // eslint-disable-line no-console
};

const logFatal = (message: string, error?: unknown, category?: string): void => {
  const errorMessage = getErrorMessage(error);
  String(category);
  const out = formatLogMessage({
    level: 'fatal',
    message,
    category,
    errorMessage,
  });
  writeToFile(buildFileLine({ formatted: out, errorMessage }));
  if (isJsonFormat(LOG_FORMAT)) {
    console.error(out); // eslint-disable-line no-console
  } else {
    console.error(out, errorMessage); // eslint-disable-line no-console
  }
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
