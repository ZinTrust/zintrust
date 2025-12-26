import { appConfig } from '@config/app';
import { ErrorFactory } from '@exceptions/ZintrustError';

export type StartupConfigValidationError = {
  key: string;
  value: unknown;
  message: string;
};

export type StartupConfigValidationResult = {
  valid: boolean;
  errors: StartupConfigValidationError[];
};

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

const getEnvInt = (key: string, defaultValue: number): number => {
  const raw = getEnvString(key, String(defaultValue));
  return Number.parseInt(raw, 10);
};

export const StartupConfigValidator = Object.freeze({
  validate(): StartupConfigValidationResult {
    const errors: StartupConfigValidationError[] = [];

    const nodeEnv = getEnvString('NODE_ENV', 'development');
    validateEnum(errors, 'NODE_ENV', nodeEnv, ['development', 'production', 'testing', 'test']);

    const appPort = getEnvInt('APP_PORT', 3000);
    validateIntRange(errors, 'APP_PORT', appPort, 1, 65535);

    const logFormat = getEnvString('LOG_FORMAT', 'text');
    validateEnum(errors, 'LOG_FORMAT', logFormat, ['text', 'json']);

    const logLevel = getEnvString('LOG_LEVEL', 'debug');
    validateEnum(errors, 'LOG_LEVEL', logLevel, ['debug', 'info', 'warn', 'error']);

    const logRotationSize = getEnvInt('LOG_ROTATION_SIZE', 10485760);
    validatePositiveInt(errors, 'LOG_ROTATION_SIZE', logRotationSize);

    const logRotationDays = getEnvInt('LOG_ROTATION_DAYS', 7);
    validatePositiveInt(errors, 'LOG_ROTATION_DAYS', logRotationDays);

    if (appConfig.isProduction()) {
      const appKey = getEnvString('APP_KEY', '');
      if (appKey.trim().length < 16) {
        pushError(
          errors,
          'APP_KEY',
          appKey,
          'APP_KEY must be set and at least 16 characters in production'
        );
      }
    }

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
