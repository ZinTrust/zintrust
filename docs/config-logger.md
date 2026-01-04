# logger config

- Source: `src/config/logger.ts`

## Usage

Import from the framework:

```ts
import { logger } from '@zintrust/core';

// Example (if supported by the module):
// logger.*
```

## Snapshot (top)

```ts
/**
 * Logger utility - Central logging configuration
 * Sealed namespace pattern - all exports through Logger namespace
 * Replaces console.* calls throughout the codebase
 */
import { Env } from '@zintrust/core';
import { appConfig } from '@zintrust/core';

interface ILogger {
  debug(message: string, data?: unknown, category?: string): void;
  info(message: string, data?: unknown, category?: string): void;
  warn(message: string, data?: unknown, category?: string): void;
  error(message: string, error?: unknown, category?: string): void;
  fatal(message: string, error?: unknown, category?: string): void;
}

const isDevelopment = (): boolean => appConfig.isDevelopment();
const isProduction = (): boolean => appConfig.isProduction();

const getLogFormat = (): string => Env.get('LOG_FORMAT', 'text');
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
```

## Snapshot (bottom)

```ts
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
    const mod = await import('@zintrust/core/node');
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

```
