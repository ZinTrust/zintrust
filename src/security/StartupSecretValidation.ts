/**
 * Startup Secret Validation
 *
 * Validates critical secrets early at boot time so production misconfiguration
 * fails fast and predictably.
 */

import { appConfig } from '@config/app';
import { securityConfig } from '@config/security';
import { startupConfig } from '@config/startup';
import { ErrorFactory } from '@exceptions/ZintrustError';

export type StartupSecretValidationError = {
  key: string;
  message: string;
};

export type StartupSecretValidationResult = {
  valid: boolean;
  errors: StartupSecretValidationError[];
};

const validateApiKeySecret = (): StartupSecretValidationError | null => {
  if (!securityConfig.apiKey.enabled) return null;

  const secret = (securityConfig.apiKey.secret ?? '').trim();
  if (secret.length > 0) return null;

  return {
    key: 'API_KEY_SECRET',
    message: 'API_KEY_SECRET must be set when API key auth is enabled',
  };
};

const validateJwtSecret = (): StartupSecretValidationError | null => {
  if (!securityConfig.jwt.enabled) return null;

  try {
    const secret = securityConfig.jwt.secret.trim();
    if (secret.length === 0) {
      return { key: 'JWT_SECRET', message: 'JWT_SECRET must be set when JWT is enabled' };
    }
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { key: 'JWT_SECRET', message };
  }
};

export const StartupSecretValidation = Object.freeze({
  validate(): StartupSecretValidationResult {
    if (!startupConfig.validateSecrets) return { valid: true, errors: [] };
    if (!appConfig.isProduction()) return { valid: true, errors: [] };

    const errors: StartupSecretValidationError[] = [];

    const jwtError = validateJwtSecret();
    if (jwtError !== null) errors.push(jwtError);

    const apiKeyError = validateApiKeySecret();
    if (apiKeyError !== null) errors.push(apiKeyError);

    return { valid: errors.length === 0, errors };
  },

  assertValid(): void {
    const result = StartupSecretValidation.validate();
    if (result.valid) return;

    throw ErrorFactory.createConfigError('Invalid startup secret configuration', {
      errors: result.errors,
    });
  },
});

export default StartupSecretValidation;
