/**
 * Logger utility - Central logging configuration
 * Sealed namespace pattern - all exports through Logger namespace
 * Replaces console.* calls throughout the codebase
 */
import { appConfig } from '@config/app';
import { Env } from '@config/env';
import type { LogLevel } from '@config/type';

interface ILogger {
  debug(message: string, data?: unknown, category?: string): void;
  info(message: string, data?: unknown, category?: string): void;
  warn(message: string, data?: unknown, category?: string): void;
  error(message: string, error?: unknown, category?: string): void;
  fatal(message: string, error?: unknown, category?: string): void;
}

const isProduction = (): boolean => appConfig.isProduction();

const getLogFormat = (): string => Env.get('LOG_FORMAT', 'text');
const isJsonFormat = (value: unknown): value is 'json' => value === 'json';

// Log level priority: lower means more verbose
const levelPriority: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const getConfiguredLogLevel = (): LogLevel => {
  const raw = Env.get('LOG_LEVEL', Env.LOG_LEVEL ?? 'debug')
    .trim()
    .toLowerCase();
  if (raw === 'debug') return 'debug';
  if (raw === 'info') return 'info';
  if (raw === 'warn') return 'warn';
  if (raw === 'error') return 'error';
  return 'info';
};

const shouldEmit = (level: LogLevel): boolean => {
  // If global disable, never emit
  if (Env.getBool('DISABLE_LOGGING', false)) return false;

  // Respect configured LOG_LEVEL
  const configured = getConfiguredLogLevel();
  const lp = levelPriority[level];
  const configuredLp = levelPriority[configured] ?? levelPriority['info'];
  return lp >= configuredLp;
};

// TODO developers should be able to customize sensitive fields via config
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
  // Respect global disable
  if (Env.getBool('DISABLE_LOGGING', false)) return false;

  // Prefer dynamic lookup so late-bound env (tests, some runtimes) is respected.
  const channel = Env.get('LOG_CHANNEL', '').trim().toLowerCase();
  const channelWantsFile = channel === 'file' || channel === 'all';
  if (!Env.getBool('LOG_TO_FILE', false) && !channelWantsFile) return false;
  if (typeof process === 'undefined') return false;
  return true;
};

const buildFileLine = (params: {
  formatted: string;
  data?: unknown;
  errorMessage?: string;
}): string => {
  if (isJsonFormat(getLogFormat())) return params.formatted;

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
  level: LogLevel;
  message: string;
  data?: unknown;
  category?: string;
  errorMessage?: string;
}): string => {
  if (isJsonFormat(getLogFormat())) {
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

  if (typeof error === 'string') return error;
  if (typeof error === 'number' || typeof error === 'bigint') return error.toString();
  if (typeof error === 'boolean') return error ? 'true' : 'false';
  if (typeof error === 'symbol') return error.toString();
  if (typeof error === 'function') return '[Function]';

  try {
    return safeStringify(error);
  } catch {
    return '[Unserializable error]';
  }
};

type CloudLogEvent = {
  timestamp: string;
  level: LogLevel;
  message: string;
  category?: string;
  data?: unknown;
  error?: string;
};

const emitCloudLogs = (event: CloudLogEvent): void => {
  // Lazy-load to avoid cycles and avoid cost when disabled.
  void (async (): Promise<void> => {
    try {
      if (event.level === 'error' || event.level === 'fatal') {
        const mod = await import('@config/logging/KvLogger');
        void mod.KvLogger.enqueue(event);
      }
    } catch {
      // best-effort
    }

    try {
      if (event.level === 'warn' || event.level === 'error' || event.level === 'fatal') {
        const mod = await import('@config/logging/SlackLogger');
        void mod.SlackLogger.enqueue(event);
      }
    } catch {
      // best-effort
    }

    try {
      const mod = await import('@config/logging/HttpLogger');
      void mod.HttpLogger.enqueue(event);
    } catch {
      // best-effort
    }
  })();
};

// Private helper functions
const logDebug = (message: string, data?: unknown, category?: string): void => {
  if (!shouldEmit('debug')) return;
  String(category);
  const timestamp = new Date().toISOString();
  const out = formatLogMessage({ level: 'debug', message, data, category });
  writeToFile(buildFileLine({ formatted: out, data }));
  if (isJsonFormat(getLogFormat())) {
    console.debug(out); // eslint-disable-line no-console
  } else {
    console.debug(out, data ?? ''); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'debug',
    message,
    category,
    data: redactSensitiveData(data),
  });
};

const logInfo = (message: string, data?: unknown, category?: string): void => {
  if (!shouldEmit('info')) return;
  String(category);
  const timestamp = new Date().toISOString();
  const out = formatLogMessage({ level: 'info', message, data, category });
  writeToFile(buildFileLine({ formatted: out, data }));
  if (isJsonFormat(getLogFormat())) {
    console.log(out); // eslint-disable-line no-console
  } else {
    console.log(out, data ?? ''); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'info',
    message,
    category,
    data: redactSensitiveData(data),
  });
};

const logWarn = (message: string, data?: unknown, category?: string): void => {
  if (!shouldEmit('warn')) return;
  String(category);
  const timestamp = new Date().toISOString();
  const out = formatLogMessage({ level: 'warn', message, data, category });
  writeToFile(buildFileLine({ formatted: out, data }));
  if (isJsonFormat(getLogFormat())) {
    console.warn(out); // eslint-disable-line no-console
  } else {
    console.warn(out, data ?? ''); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'warn',
    message,
    category,
    data: redactSensitiveData(data),
  });
};

const logError = (message: string, error?: unknown, category?: string): void => {
  if (!shouldEmit('error')) return;
  const errorMessage = getErrorMessage(error);
  String(category);
  const timestamp = new Date().toISOString();
  const out = formatLogMessage({
    level: 'error',
    message,
    category,
    errorMessage,
  });
  writeToFile(buildFileLine({ formatted: out, errorMessage }));
  if (isJsonFormat(getLogFormat())) {
    console.error(out); // eslint-disable-line no-console
  } else {
    console.error(out, errorMessage); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'error',
    message,
    category,
    error: errorMessage,
  });
};

const logFatal = (message: string, error?: unknown, category?: string): void => {
  if (!shouldEmit('fatal')) return;
  const errorMessage = getErrorMessage(error);
  String(category);
  const timestamp = new Date().toISOString();
  const out = formatLogMessage({
    level: 'fatal',
    message,
    category,
    errorMessage,
  });
  writeToFile(buildFileLine({ formatted: out, errorMessage }));
  if (isJsonFormat(getLogFormat())) {
    console.error(out); // eslint-disable-line no-console
  } else {
    console.error(out, errorMessage); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'fatal',
    message,
    category,
    error: errorMessage,
  });

  if (isProduction() && typeof process !== 'undefined') {
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

// Expose log cleanup API and sealed namespace with all logger functionality
export const cleanLogsOnce = async (): Promise<string[]> => {
  if (!shouldLogToFile()) return [];

  try {
    const mod = await import('@config/FileLogWriter');
    const deleted = mod.cleanOnce();
    logInfo('Log cleanup executed', { deletedCount: deleted.length });
    return deleted;
  } catch (err: unknown) {
    logError('Log cleanup failed', err as Error);
    return [];
  }
};

export const Logger = Object.freeze({
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  fatal: logFatal,
  cleanLogsOnce,
  scope: createLoggerScope,
});

export default Logger;
