# StartupConfigValidator config

- Source: `src/config/StartupConfigValidator.ts`

## Usage

Import from the framework:

```ts
import { StartupConfigValidator } from '@zintrust/core';

// Example (if supported by the module):
// StartupConfigValidator.*
```

## Snapshot (top)

```ts
import { appConfig } from '@config/app';
import type { StartupConfigValidationError, StartupConfigValidationResult } from '@zintrust/core';
import { ErrorFactory } from '@exceptions/ZintrustError';

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
```

## Snapshot (bottom)

```ts

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

```
