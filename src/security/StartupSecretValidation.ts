/**
 * Startup Secret Validation
 *
 * Validates critical secrets early at boot time so production misconfiguration
 * fails fast and predictably.
 */

import { appConfig } from '@config/app';
import { Env } from '@config/env';
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
    const appKey = (Env.APP_KEY ?? '').trim();
    if (secret.length === 0) {
      if (appKey.length > 0) return null;
      return {
        key: 'JWT_SECRET',
        message: 'JWT_SECRET must be set when JWT is enabled (or provide APP_KEY)',
      };
    }
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { key: 'JWT_SECRET', message };
  }
};

const normalizeCipher = (raw: string): 'aes-256-cbc' | 'aes-256-gcm' | null => {
  const value = raw.trim().toLowerCase();
  if (value === 'aes-256-cbc') return 'aes-256-cbc';
  if (value === 'aes-256-gcm') return 'aes-256-gcm';
  return null;
};

const parseBase64KeyBytes = (rawKey: string): number | null => {
  const base64 = rawKey.startsWith('base64:') ? rawKey.slice('base64:'.length) : rawKey;

  const decoded = Buffer.from(base64, 'base64');
  if (decoded.length === 0) {
    return null;
  }
  return decoded.length;
};

const validateEncryptionInterop = (): StartupSecretValidationError[] => {
  const errors: StartupSecretValidationError[] = [];

  const cipherRaw = (Env.ENCRYPTION_CIPHER ?? '').trim();
  if (cipherRaw.length === 0) {
    errors.push({
      key: 'ENCRYPTION_CIPHER',
      message: 'ENCRYPTION_CIPHER must be set (supported: aes-256-cbc, aes-256-gcm)',
    });
    return errors;
  }

  const cipher = normalizeCipher(cipherRaw);
  if (cipher === null) {
    errors.push({
      key: 'ENCRYPTION_CIPHER',
      message: 'Unsupported ENCRYPTION_CIPHER (supported: aes-256-cbc, aes-256-gcm)',
    });
  }

  const appKey = (Env.APP_KEY ?? '').trim();
  if (appKey.length === 0) {
    errors.push({ key: 'APP_KEY', message: 'APP_KEY must be set for encryption interoperability' });
    return errors;
  }

  const bytes = parseBase64KeyBytes(appKey);
  if (bytes === null) {
    errors.push({
      key: 'APP_KEY',
      message: 'APP_KEY must be valid base64 (supports base64:... prefix)',
    });
    return errors;
  }

  // Current supported ciphers are aes-256-*, so require 32-byte keys.
  if (bytes !== 32) {
    errors.push({
      key: 'APP_KEY',
      message: `APP_KEY must decode to 32 bytes for ${cipherRaw}`,
    });
  }

  const prev = (Env.APP_PREVIOUS_KEYS ?? '').trim();
  if (prev.length > 0 && prev.startsWith('[')) {
    try {
      const parsed = JSON.parse(prev) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
        errors.push({
          key: 'APP_PREVIOUS_KEYS',
          message: 'APP_PREVIOUS_KEYS JSON must be an array of strings',
        });
      }
    } catch {
      errors.push({ key: 'APP_PREVIOUS_KEYS', message: 'APP_PREVIOUS_KEYS must be valid JSON' });
    }
  }

  return errors;
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

    errors.push(...validateEncryptionInterop());

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
