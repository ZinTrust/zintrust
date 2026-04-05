/**
 * Logger utility - Central logging configuration
 * Sealed namespace pattern - all exports through Logger namespace
 * Replaces console.* calls throughout the codebase
 */
import { isNonEmptyString } from '@/helper';
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

const getEnvString = (key: string, fallback: string): string => {
  const envGet = (Env as { get?: (k: string, f?: string) => string }).get;
  if (typeof envGet !== 'function') return fallback;
  try {
    const value = envGet(key, fallback);
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  } catch {
    return fallback;
  }
};

const getEnvBool = (key: string, fallback: boolean): boolean => {
  const envGetBool = (Env as { getBool?: (k: string, f?: boolean) => boolean }).getBool;
  if (typeof envGetBool !== 'function') return fallback;
  try {
    return envGetBool(key, fallback);
  } catch {
    return fallback;
  }
};

const getLogFormat = (): string => getEnvString('LOG_FORMAT', 'text');
const isJsonFormat = (value: unknown): value is 'json' => value === 'json';

const ANSI = Object.freeze({
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  gray: '\u001b[90m',
  red: '\u001b[31m',
  brightRed: '\u001b[91m',
  green: '\u001b[32m',
  brightGreen: '\u001b[92m',
  yellow: '\u001b[33m',
  brightYellow: '\u001b[93m',
  blue: '\u001b[34m',
  brightBlue: '\u001b[94m',
  magenta: '\u001b[35m',
  brightMagenta: '\u001b[95m',
  cyan: '\u001b[36m',
  brightCyan: '\u001b[96m',
  white: '\u001b[97m',
});

type LoggerColorThemeName =
  | 'arctic'
  | 'sharp-ops'
  | 'soft-contrast'
  | 'neon-grid'
  | 'production-safe';

type RequestLogColorTheme = Readonly<{
  level: Readonly<Record<LogLevel, string>>;
  method: Readonly<Record<string, string>>;
  methodFallback: string;
  path: string;
  status: Readonly<{
    success: string;
    redirect: string;
    warn: string;
    special: string;
    error: string;
    fallback: string;
  }>;
  duration: Readonly<{
    fast: string;
    steady: string;
    elevated: string;
    slow: string;
    critical: string;
  }>;
  meta: string;
}>;

const REQUEST_LOG_COLOR_THEMES: Readonly<Record<LoggerColorThemeName, RequestLogColorTheme>> =
  Object.freeze({
    arctic: Object.freeze({
      level: Object.freeze({
        debug: ANSI.gray,
        info: `${ANSI.bold}${ANSI.brightCyan}`,
        warn: `${ANSI.bold}${ANSI.brightYellow}`,
        error: `${ANSI.bold}${ANSI.brightRed}`,
        fatal: `${ANSI.bold}${ANSI.brightMagenta}`,
      }),
      method: Object.freeze({
        GET: `${ANSI.bold}${ANSI.brightBlue}`,
        POST: `${ANSI.bold}${ANSI.brightGreen}`,
        PUT: `${ANSI.bold}${ANSI.brightYellow}`,
        PATCH: `${ANSI.bold}${ANSI.brightMagenta}`,
        DELETE: `${ANSI.bold}${ANSI.brightRed}`,
        HEAD: `${ANSI.bold}${ANSI.cyan}`,
        OPTIONS: `${ANSI.bold}${ANSI.brightMagenta}`,
      }),
      methodFallback: `${ANSI.bold}${ANSI.white}`,
      path: ANSI.white,
      status: Object.freeze({
        success: `${ANSI.bold}${ANSI.brightGreen}`,
        redirect: `${ANSI.bold}${ANSI.cyan}`,
        warn: `${ANSI.bold}${ANSI.yellow}`,
        special: `${ANSI.bold}${ANSI.brightMagenta}`,
        error: `${ANSI.bold}${ANSI.brightRed}`,
        fallback: `${ANSI.bold}${ANSI.white}`,
      }),
      duration: Object.freeze({
        fast: `${ANSI.bold}${ANSI.cyan}`,
        steady: `${ANSI.bold}${ANSI.brightBlue}`,
        elevated: `${ANSI.bold}${ANSI.brightYellow}`,
        slow: `${ANSI.bold}${ANSI.yellow}`,
        critical: `${ANSI.bold}${ANSI.brightRed}`,
      }),
      meta: `${ANSI.dim}${ANSI.cyan}`,
    }),
    'sharp-ops': Object.freeze({
      level: Object.freeze({
        debug: ANSI.gray,
        info: `${ANSI.bold}${ANSI.cyan}`,
        warn: `${ANSI.bold}${ANSI.yellow}`,
        error: `${ANSI.bold}${ANSI.red}`,
        fatal: `${ANSI.bold}${ANSI.brightMagenta}`,
      }),
      method: Object.freeze({
        GET: `${ANSI.bold}${ANSI.brightBlue}`,
        POST: `${ANSI.bold}${ANSI.green}`,
        PUT: `${ANSI.bold}${ANSI.yellow}`,
        PATCH: `${ANSI.bold}${ANSI.magenta}`,
        DELETE: `${ANSI.bold}${ANSI.red}`,
        HEAD: `${ANSI.bold}${ANSI.blue}`,
        OPTIONS: `${ANSI.bold}${ANSI.brightMagenta}`,
      }),
      methodFallback: `${ANSI.bold}${ANSI.white}`,
      path: ANSI.white,
      status: Object.freeze({
        success: `${ANSI.bold}${ANSI.green}`,
        redirect: `${ANSI.bold}${ANSI.brightBlue}`,
        warn: `${ANSI.bold}${ANSI.yellow}`,
        special: `${ANSI.bold}${ANSI.brightMagenta}`,
        error: `${ANSI.bold}${ANSI.red}`,
        fallback: `${ANSI.bold}${ANSI.white}`,
      }),
      duration: Object.freeze({
        fast: `${ANSI.bold}${ANSI.green}`,
        steady: `${ANSI.bold}${ANSI.brightGreen}`,
        elevated: `${ANSI.bold}${ANSI.yellow}`,
        slow: `${ANSI.bold}${ANSI.brightYellow}`,
        critical: `${ANSI.bold}${ANSI.red}`,
      }),
      meta: `${ANSI.dim}${ANSI.gray}`,
    }),
    'soft-contrast': Object.freeze({
      level: Object.freeze({
        debug: ANSI.gray,
        info: `${ANSI.bold}${ANSI.white}`,
        warn: `${ANSI.bold}${ANSI.yellow}`,
        error: `${ANSI.bold}${ANSI.red}`,
        fatal: `${ANSI.bold}${ANSI.magenta}`,
      }),
      method: Object.freeze({
        GET: `${ANSI.bold}${ANSI.blue}`,
        POST: `${ANSI.bold}${ANSI.cyan}`,
        PUT: `${ANSI.bold}${ANSI.yellow}`,
        PATCH: `${ANSI.bold}${ANSI.magenta}`,
        DELETE: `${ANSI.bold}${ANSI.brightRed}`,
        HEAD: `${ANSI.bold}${ANSI.gray}`,
        OPTIONS: `${ANSI.bold}${ANSI.brightMagenta}`,
      }),
      methodFallback: `${ANSI.bold}${ANSI.white}`,
      path: `${ANSI.bold}${ANSI.white}`,
      status: Object.freeze({
        success: `${ANSI.bold}${ANSI.cyan}`,
        redirect: `${ANSI.bold}${ANSI.blue}`,
        warn: `${ANSI.bold}${ANSI.yellow}`,
        special: `${ANSI.bold}${ANSI.brightMagenta}`,
        error: `${ANSI.bold}${ANSI.red}`,
        fallback: `${ANSI.bold}${ANSI.white}`,
      }),
      duration: Object.freeze({
        fast: `${ANSI.bold}${ANSI.cyan}`,
        steady: `${ANSI.bold}${ANSI.brightBlue}`,
        elevated: `${ANSI.bold}${ANSI.yellow}`,
        slow: `${ANSI.bold}${ANSI.brightYellow}`,
        critical: `${ANSI.bold}${ANSI.red}`,
      }),
      meta: `${ANSI.dim}${ANSI.white}`,
    }),
    'neon-grid': Object.freeze({
      level: Object.freeze({
        debug: ANSI.gray,
        info: `${ANSI.bold}${ANSI.cyan}`,
        warn: `${ANSI.bold}${ANSI.brightYellow}`,
        error: `${ANSI.bold}${ANSI.brightRed}`,
        fatal: `${ANSI.bold}${ANSI.brightMagenta}`,
      }),
      method: Object.freeze({
        GET: `${ANSI.bold}${ANSI.brightCyan}`,
        POST: `${ANSI.bold}${ANSI.brightGreen}`,
        PUT: `${ANSI.bold}${ANSI.brightYellow}`,
        PATCH: `${ANSI.bold}${ANSI.brightMagenta}`,
        DELETE: `${ANSI.bold}${ANSI.brightRed}`,
        HEAD: `${ANSI.bold}${ANSI.brightBlue}`,
        OPTIONS: `${ANSI.bold}${ANSI.magenta}`,
      }),
      methodFallback: `${ANSI.bold}${ANSI.white}`,
      path: `${ANSI.bold}${ANSI.white}`,
      status: Object.freeze({
        success: `${ANSI.bold}${ANSI.brightGreen}`,
        redirect: `${ANSI.bold}${ANSI.brightCyan}`,
        warn: `${ANSI.bold}${ANSI.brightYellow}`,
        special: `${ANSI.bold}${ANSI.brightMagenta}`,
        error: `${ANSI.bold}${ANSI.brightRed}`,
        fallback: `${ANSI.bold}${ANSI.white}`,
      }),
      duration: Object.freeze({
        fast: `${ANSI.bold}${ANSI.brightCyan}`,
        steady: `${ANSI.bold}${ANSI.brightGreen}`,
        elevated: `${ANSI.bold}${ANSI.yellow}`,
        slow: `${ANSI.bold}${ANSI.brightYellow}`,
        critical: `${ANSI.bold}${ANSI.brightRed}`,
      }),
      meta: `${ANSI.dim}${ANSI.gray}`,
    }),
    'production-safe': Object.freeze({
      level: Object.freeze({
        debug: ANSI.gray,
        info: `${ANSI.bold}${ANSI.blue}`,
        warn: `${ANSI.bold}${ANSI.yellow}`,
        error: `${ANSI.bold}${ANSI.red}`,
        fatal: `${ANSI.bold}${ANSI.magenta}`,
      }),
      method: Object.freeze({
        GET: `${ANSI.bold}${ANSI.blue}`,
        POST: `${ANSI.bold}${ANSI.green}`,
        PUT: `${ANSI.bold}${ANSI.yellow}`,
        PATCH: `${ANSI.bold}${ANSI.magenta}`,
        DELETE: `${ANSI.bold}${ANSI.red}`,
        HEAD: `${ANSI.bold}${ANSI.gray}`,
        OPTIONS: `${ANSI.bold}${ANSI.brightMagenta}`,
      }),
      methodFallback: `${ANSI.bold}${ANSI.white}`,
      path: ANSI.white,
      status: Object.freeze({
        success: `${ANSI.bold}${ANSI.green}`,
        redirect: `${ANSI.bold}${ANSI.blue}`,
        warn: `${ANSI.bold}${ANSI.yellow}`,
        special: `${ANSI.bold}${ANSI.brightMagenta}`,
        error: `${ANSI.bold}${ANSI.red}`,
        fallback: `${ANSI.bold}${ANSI.white}`,
      }),
      duration: Object.freeze({
        fast: `${ANSI.bold}${ANSI.green}`,
        steady: `${ANSI.bold}${ANSI.brightGreen}`,
        elevated: `${ANSI.bold}${ANSI.yellow}`,
        slow: `${ANSI.bold}${ANSI.brightYellow}`,
        critical: `${ANSI.bold}${ANSI.red}`,
      }),
      meta: `${ANSI.dim}${ANSI.gray}`,
    }),
  });

const LOGGER_COLOR_THEME_ALIASES: Readonly<Record<string, LoggerColorThemeName>> = Object.freeze({
  arctic: 'arctic',
  'arctic-terminal': 'arctic',
  'theme-a': 'arctic',
  'sharp-ops': 'sharp-ops',
  sharpops: 'sharp-ops',
  'theme-b': 'sharp-ops',
  'soft-contrast': 'soft-contrast',
  softcontrast: 'soft-contrast',
  'theme-c': 'soft-contrast',
  'neon-grid': 'neon-grid',
  neongrid: 'neon-grid',
  'theme-d': 'neon-grid',
  'production-safe': 'production-safe',
  productionsafe: 'production-safe',
  'theme-e': 'production-safe',
});

const getLoggerColorThemeName = (): LoggerColorThemeName => {
  const normalized = getEnvString('LOG_COLOR_THEME', 'arctic')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replaceAll(' ', '-');

  return LOGGER_COLOR_THEME_ALIASES[normalized] ?? 'arctic';
};

const getLoggerColorTheme = (): RequestLogColorTheme =>
  REQUEST_LOG_COLOR_THEMES[getLoggerColorThemeName()];

const REQUEST_LOG_PATTERN =
  /^(\[[A-Z]+\])\s(.+?)\s(\d{3}(?: [A-Za-z][A-Za-z' -]*)?)\s\((\d+)ms\)(\s\[[^\]]+\])?$/;

const colorize = (value: string, colorCode: string): string => `${colorCode}${value}${ANSI.reset}`;

const shouldColorizeConsoleText = (): boolean => {
  if (isJsonFormat(getLogFormat())) return false;

  const configured = getEnvString('LOG_COLOR', 'true').trim().toLowerCase();
  if (
    configured === 'false' ||
    configured === '0' ||
    configured === 'off' ||
    configured === 'never'
  ) {
    return false;
  }
  if (
    configured === 'true' ||
    configured === '1' ||
    configured === 'on' ||
    configured === 'always'
  ) {
    return true;
  }

  if (getEnvString('NO_COLOR', '').trim() !== '') return false;
  if (typeof process === 'undefined') return true;
  return process.stdout?.isTTY !== false;
};

const getLevelColor = (level: LogLevel): string => {
  return getLoggerColorTheme().level[level];
};

const getMethodColor = (methodToken: string): string => {
  const theme = getLoggerColorTheme();
  const method = methodToken.replaceAll('[', '').replaceAll(']', '');
  return theme.method[method] ?? theme.methodFallback;
};

const getStatusColor = (status: number): string => {
  const theme = getLoggerColorTheme();
  if (status === 419) return theme.status.special;
  if (status >= 500) return theme.status.error;
  if (status >= 400) return theme.status.warn;
  if (status >= 300) return theme.status.redirect;
  if (status >= 200) return theme.status.success;
  return theme.status.fallback;
};

const getDurationColor = (durationMs: number): string => {
  const theme = getLoggerColorTheme();
  if (durationMs >= 1000) return theme.duration.critical;
  if (durationMs >= 250) return theme.duration.slow;
  if (durationMs >= 100) return theme.duration.elevated;
  if (durationMs >= 50) return theme.duration.steady;
  return theme.duration.fast;
};

const colorizeRequestLogMessage = (line: string): string => {
  const match = REQUEST_LOG_PATTERN.exec(line);
  if (!match) return line;

  const theme = getLoggerColorTheme();

  const methodToken = match[1] ?? '';
  const path = match[2] ?? '';
  const statusSummary = match[3] ?? '';
  const durationMs = Number.parseInt(match[4] ?? '0', 10);
  const meta = (match[5] ?? '').trim();
  const statusCode = Number.parseInt(statusSummary.split(' ')[0] ?? '0', 10);

  const pieces = [
    colorize(methodToken, getMethodColor(methodToken)),
    colorize(path, theme.path),
    colorize(statusSummary, getStatusColor(statusCode)),
    colorize(`(${durationMs}ms)`, getDurationColor(durationMs)),
  ];

  if (meta !== '') {
    pieces.push(colorize(meta, theme.meta));
  }

  return pieces.join(' ');
};

const colorizeConsoleTextMessage = (level: LogLevel, line: string): string => {
  if (!shouldColorizeConsoleText()) return line;

  const levelToken = `[${level.toUpperCase()}]`;
  if (!line.startsWith(`${levelToken} `)) {
    return colorize(line, getLevelColor(level));
  }

  const rest = line.slice(levelToken.length + 1);
  return `${colorize(levelToken, getLevelColor(level))} ${colorizeRequestLogMessage(rest)}`;
};

// Log level priority: lower means more verbose
const levelPriority: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const getConfiguredLogLevel = (): LogLevel => {
  const raw = getEnvString('LOG_LEVEL', Env.LOG_LEVEL ?? 'debug')
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
  if (getEnvBool('DISABLE_LOGGING', false)) return false;

  // Respect configured LOG_LEVEL
  const configured = getConfiguredLogLevel();
  const lp = levelPriority[level];
  const configuredLp = levelPriority[configured] ?? levelPriority['info'];
  return lp >= configuredLp;
};

const BASE_SENSITIVE_FIELDS = Object.freeze([
  'password',
  'token',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'jwt',
  'bearer',
]);

const SENSITIVE_FIELD_KEY_PATTERN = /^[a-z0-9_.-]+$/;

const parseSensitiveFields = (rawValue: string): string[] => {
  try {
    return rawValue
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => isNonEmptyString(value) && SENSITIVE_FIELD_KEY_PATTERN.test(value));
  } catch {
    return [];
  }
};

const getSensitiveFields = (): Set<string> => {
  const configuredFieldsRaw = getEnvString('SENSITIVE_FIELDS', '');
  const configuredFields = isNonEmptyString(configuredFieldsRaw)
    ? parseSensitiveFields(configuredFieldsRaw)
    : [];

  return new Set<string>([...BASE_SENSITIVE_FIELDS, ...configuredFields]);
};

const redactSensitiveData = (data: unknown): unknown => {
  const sensitiveFields = getSensitiveFields();
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
        if (sensitiveFields.has(key.toLowerCase())) {
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
  if (getEnvBool('DISABLE_LOGGING', false)) return false;

  // Prefer dynamic lookup so late-bound env (tests, some runtimes) is respected.
  const channel = getEnvString('LOG_CHANNEL', '').trim().toLowerCase();
  const channelWantsFile = channel === 'file' || channel === 'all';
  if (!getEnvBool('LOG_TO_FILE', false) && !channelWantsFile) return false;
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
    console.debug(colorizeConsoleTextMessage('debug', out), data ?? ''); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'debug',
    message,
    category,
    data: redactSensitiveData(data),
  });

  dispatchToSinks('debug', message, data);
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
    console.log(colorizeConsoleTextMessage('info', out), data ?? ''); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'info',
    message,
    category,
    data: redactSensitiveData(data),
  });

  dispatchToSinks('info', message, data);
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
    console.warn(colorizeConsoleTextMessage('warn', out), data ?? ''); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'warn',
    message,
    category,
    data: redactSensitiveData(data),
  });

  dispatchToSinks('warn', message, data);
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
    console.error(colorizeConsoleTextMessage('error', out), errorMessage); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'error',
    message,
    category,
    error: errorMessage,
  });

  dispatchToSinks('error', message, error);
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
    console.error(colorizeConsoleTextMessage('fatal', out), errorMessage); // eslint-disable-line no-console
  }

  emitCloudLogs({
    timestamp,
    level: 'fatal',
    message,
    category,
    error: errorMessage,
  });

  dispatchToSinks('fatal', message, error);

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

/**
 * External log sink. Receives every log line after the built-in sinks have fired.
 * Return value is ignored; errors are swallowed to protect the caller.
 */
export type LogSink = (level: LogLevel, message: string, context?: Record<string, unknown>) => void;

const loggerSinks: LogSink[] = [];

const dispatchToSinks = (level: LogLevel, message: string, data?: unknown): void => {
  if (loggerSinks.length === 0) return;
  let context: Record<string, unknown> | undefined;

  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    context = data as Record<string, unknown>;
  } else if (data === undefined) {
    context = undefined;
  } else {
    context = { value: data };
  }

  for (const sink of loggerSinks) {
    try {
      sink(level, message, context);
    } catch {
      // best-effort — sinks must never crash the caller
    }
  }
};

const addSink = (fn: LogSink): (() => void) => {
  loggerSinks.push(fn);
  return (): void => {
    const idx = loggerSinks.indexOf(fn);
    if (idx !== -1) loggerSinks.splice(idx, 1);
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
  addSink,
});

export default Logger;
