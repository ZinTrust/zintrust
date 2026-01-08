import { appConfig } from '@zintrust/core';
import type { StartupConfigValidationError, StartupConfigValidationResult } from '@zintrust/core';
import { ErrorFactory } from '@zintrust/core';

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('key') ||
    normalized.includes('authorization')
  );
};

const redactValue = (key: string, value: unknown): unknown => {
  return isSensitiveKey(key) ? '<redacted>' : value;
};

const pushError = (
  errors: StartupConfigValidationError[],
  key: string,
  value: unknown,
  message: string
): void => {
  errors.push({ key, value: redactValue(key, value), message });
};

const validateEnum = (
  errors: StartupConfigValidationError[],
  key: string,
  value: string,
  allowed: readonly string[]
): void => {
  if (!allowed.includes(value)) {
    pushError(errors, key, value, `${key} must be one of: ${allowed.join(', ')}`);
  }
};

const validateIntRange = (
  errors: StartupConfigValidationError[],
  key: string,
  value: number,
  min: number,
  max: number
): void => {
  if (Number.isNaN(value)) {
    pushError(errors, key, value, `${key} must be a valid integer`);
    return;
  }

  if (value < min || value > max) {
    pushError(errors, key, value, `${key} must be between ${min} and ${max}`);
  }
};

const validatePositiveInt = (
  errors: StartupConfigValidationError[],
  key: string,
  value: number
): void => {
  if (Number.isNaN(value)) {
    pushError(errors, key, value, `${key} must be a valid integer`);
    return;
  }

  if (value <= 0) {
    pushError(errors, key, value, `${key} must be greater than 0`);
  }
};

type ProcessLike = {
  env?: Record<string, string | undefined>;
};

const getProcessLike = (): ProcessLike | undefined => {
  return typeof process === 'undefined' ? undefined : (process as unknown as ProcessLike);
};

const getEnvString = (key: string, defaultValue: string): string => {
  const proc = getProcessLike();
  const env = proc?.env ?? {};
  return env[key] ?? defaultValue;
};

const getEnvOptionalString = (key: string): string | undefined => {
  const proc = getProcessLike();
  const env = proc?.env ?? {};
  const value = env[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const getEnvBoolLoose = (key: string, defaultValue: boolean): boolean => {
  const raw = getEnvOptionalString(key);
  if (raw === undefined) return defaultValue;
  const normalized = raw.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const getEnvInt = (key: string, defaultValue: number): number => {
  const raw = getEnvString(key, String(defaultValue));
  return Number.parseInt(raw, 10);
};

type RequireEnvStringOptions = {
  aliases?: readonly string[];
  requiredMessage?: string;
  minLength?: number;
  minLengthMessage?: string;
};

const requireEnvString = (
  errors: StartupConfigValidationError[],
  key: string,
  options: RequireEnvStringOptions = {}
): string | undefined => {
  const value =
    getEnvOptionalString(key) ??
    (options.aliases ?? []).reduce<string | undefined>((found, alias) => {
      if (found !== undefined) return found;
      return getEnvOptionalString(alias);
    }, undefined);

  if (value === undefined) {
    pushError(errors, key, value, options.requiredMessage ?? `${key} is required`);
    return undefined;
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    pushError(
      errors,
      key,
      value,
      options.minLengthMessage ?? `${key} must be at least ${options.minLength} characters`
    );
  }

  return value;
};

const validateSqliteDbFileRequired = (
  errors: StartupConfigValidationError[],
  dbConnection: string | undefined
): void => {
  // sqlite convenience: accept DB_DATABASE or DB_PATH
  if ((dbConnection ?? '').toLowerCase() !== 'sqlite') return;

  const dbFile = getEnvOptionalString('DB_DATABASE') ?? getEnvOptionalString('DB_PATH');
  if (dbFile === undefined) {
    pushError(errors, 'DB_DATABASE', dbFile, 'DB_DATABASE (or DB_PATH) is required for sqlite');
  }
};

const validateStrictRequiredEnv = (errors: StartupConfigValidationError[]): void => {
  const requireEnv = getEnvBoolLoose('STARTUP_REQUIRE_ENV', false);
  if (!requireEnv) return;

  requireEnvString(errors, 'NODE_ENV');
  requireEnvString(errors, 'APP_NAME');
  requireEnvString(errors, 'HOST');

  const portRaw = requireEnvString(errors, 'PORT', {
    aliases: ['APP_PORT'],
    requiredMessage: 'PORT (or APP_PORT) is required',
  });
  if (portRaw !== undefined) {
    const port = Number.parseInt(portRaw, 10);
    validateIntRange(errors, 'PORT', port, 1, 65535);
  }

  const dbConnection = requireEnvString(errors, 'DB_CONNECTION');

  requireEnvString(errors, 'APP_KEY', { minLength: 16 });
  requireEnvString(errors, 'LOG_LEVEL');
  requireEnvString(errors, 'LOG_CHANNEL');

  validateSqliteDbFileRequired(errors, dbConnection);
};

const validateNodeEnv = (errors: StartupConfigValidationError[]): void => {
  const nodeEnv = getEnvString('NODE_ENV', 'development');
  validateEnum(errors, 'NODE_ENV', nodeEnv, ['development', 'production', 'testing', 'test']);
};

const validatePort = (errors: StartupConfigValidationError[]): void => {
  // Port can be provided as PORT or APP_PORT. In non-strict mode we keep defaults.
  const portFromPort = getEnvOptionalString('PORT');
  const portFromAppPort = getEnvOptionalString('APP_PORT');
  const portRaw = portFromPort ?? portFromAppPort;

  if (portRaw === undefined) {
    const appPort = getEnvInt('APP_PORT', 3000);
    validateIntRange(errors, 'APP_PORT', appPort, 1, 65535);
    return;
  }

  const parsed = Number.parseInt(portRaw, 10);
  const key = portFromPort === undefined ? 'APP_PORT' : 'PORT';
  validateIntRange(errors, key, parsed, 1, 65535);
};

const validateLogging = (errors: StartupConfigValidationError[]): void => {
  const logFormat = getEnvString('LOG_FORMAT', 'text');
  validateEnum(errors, 'LOG_FORMAT', logFormat, ['text', 'json']);

  const logLevel = getEnvString('LOG_LEVEL', 'debug');
  validateEnum(errors, 'LOG_LEVEL', logLevel, ['debug', 'info', 'warn', 'error']);

  // Optional (but validated when provided): LOG_CHANNEL (starter apps often use this)
  const logChannel = getEnvOptionalString('LOG_CHANNEL');
  if (logChannel !== undefined) {
    validateEnum(errors, 'LOG_CHANNEL', logChannel, ['console', 'file', 'all']);
  }
};

const validateRotationAndTimeout = (errors: StartupConfigValidationError[]): void => {
  const logRotationSize = getEnvInt('LOG_ROTATION_SIZE', 10485760);
  validatePositiveInt(errors, 'LOG_ROTATION_SIZE', logRotationSize);

  const logRotationDays = getEnvInt('LOG_ROTATION_DAYS', 7);
  validatePositiveInt(errors, 'LOG_ROTATION_DAYS', logRotationDays);

  const startupHealthTimeoutMs = getEnvInt('STARTUP_HEALTH_TIMEOUT_MS', 2500);
  validatePositiveInt(errors, 'STARTUP_HEALTH_TIMEOUT_MS', startupHealthTimeoutMs);
};

const validateProductionAppKey = (errors: StartupConfigValidationError[]): void => {
  if (!appConfig.isProduction()) return;

  const appKey = getEnvString('APP_KEY', '');
  if (appKey.trim().length < 16) {
    pushError(
      errors,
      'APP_KEY',
      appKey,
      'APP_KEY must be set and at least 16 characters in production'
    );
  }
};

export const StartupConfigValidator = Object.freeze({
  validate(): StartupConfigValidationResult {
    const errors: StartupConfigValidationError[] = [];

    validateStrictRequiredEnv(errors);

    validateNodeEnv(errors);
    validatePort(errors);
    validateLogging(errors);
    validateRotationAndTimeout(errors);
    validateProductionAppKey(errors);

    return { valid: errors.length === 0, errors };
  },

  assertValid(): void {
    const result = StartupConfigValidator.validate();
    if (result.valid) return;

    throw ErrorFactory.createConfigError('Invalid startup configuration', {
      errors: result.errors,
    });
  },
});

export default StartupConfigValidator;
