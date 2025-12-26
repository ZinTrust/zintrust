/**
 * Unified Secrets Management Layer
 * Abstracts secrets retrieval across different cloud platforms
 * Supports: AWS Secrets Manager, Parameter Store, Cloudflare KV, Deno env
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

export interface CloudflareKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

export interface SecretConfig {
  platform: 'aws' | 'cloudflare' | 'deno' | 'local';
  region?: string;
  kv?: CloudflareKV; // Cloudflare KV namespace
}

export interface SecretValue {
  key: string;
  value: string;
  expiresAt?: number;
  rotationEnabled?: boolean;
}

let instance: SecretsManagerInstance | undefined;

interface SecretsManagerInstance {
  getSecret(key: string, options?: GetSecretOptions): Promise<string>;
  setSecret(key: string, value: string, options?: SetSecretOptions): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  rotateSecret(key: string): Promise<void>;
  listSecrets(pattern?: string): Promise<string[]>;
  clearCache(key?: string): void;
}

/**
 * Get secret value from appropriate backend
 */
async function runGetSecret(
  config: SecretConfig,
  cache: Map<string, { value: string; expiresAt: number }>,
  key: string,
  options?: GetSecretOptions
): Promise<string> {
  // Check cache first
  const cached = cache.get(key);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value: string;

  switch (config.platform) {
    case 'aws':
      value = await getFromAWSSecretsManager(key);
      break;
    case 'cloudflare':
      value = await getFromCloudflareKV(config, key);
      break;
    case 'deno':
      value = await getFromDenoEnv(key);
      break;
    case 'local':
    default:
      value = await getFromEnv(key);
  }

  // Cache the value
  const ttl = options?.cacheTtl ?? 3600000; // 1 hour default
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });

  return value;
}

/**
 * Set secret value
 */
async function runSetSecret(
  config: SecretConfig,
  cache: Map<string, { value: string; expiresAt: number }>,
  key: string,
  value: string,
  options?: SetSecretOptions
): Promise<void> {
  switch (config.platform) {
    case 'aws':
      await setInAWSSecretsManager(key, value, options);
      break;
    case 'cloudflare':
      await setInCloudflareKV(config, key, value, options);
      break;
    case 'deno':
      throw ErrorFactory.createConfigError('Cannot set secrets in Deno environment');
    case 'local':
    default:
      throw ErrorFactory.createConfigError('Cannot set secrets in local environment');
  }

  // Invalidate cache
  cache.delete(key);
}

/**
 * Delete secret
 */
async function runDeleteSecret(
  config: SecretConfig,
  cache: Map<string, { value: string; expiresAt: number }>,
  key: string
): Promise<void> {
  switch (config.platform) {
    case 'aws':
      await deleteFromAWSSecretsManager(key);
      break;
    case 'cloudflare':
      await deleteFromCloudflareKV(config, key);
      break;
    case 'deno':
    case 'local':
    default:
      throw ErrorFactory.createConfigError('Cannot delete secrets in this environment');
  }

  // Invalidate cache
  cache.delete(key);
}

/**
 * SecretsManager implementation
 * Refactored to Functional Object pattern
 */
const SecretsManagerImpl = {
  /**
   * Create a new secrets manager instance
   */
  create(config: SecretConfig): SecretsManagerInstance {
    const cache: Map<string, { value: string; expiresAt: number }> = new Map();

    return {
      /**
       * Get secret value from appropriate backend
       */
      async getSecret(key: string, options?: GetSecretOptions): Promise<string> {
        return runGetSecret(config, cache, key, options);
      },

      /**
       * Set secret value
       */
      async setSecret(key: string, value: string, options?: SetSecretOptions): Promise<void> {
        return runSetSecret(config, cache, key, value, options);
      },

      /**
       * Delete secret
       */
      async deleteSecret(key: string): Promise<void> {
        return runDeleteSecret(config, cache, key);
      },

      /**
       * Rotate secret (trigger new secret generation)
       */
      async rotateSecret(_key: string): Promise<void> {
        if (config.platform === 'aws') {
          // AWS Secrets Manager supports automatic rotation
          return Promise.reject(ErrorFactory.createConfigError('Secret rotation not implemented'));
        }
        return Promise.reject(
          ErrorFactory.createConfigError('Secret rotation not supported on this platform')
        );
      },

      /**
       * Get all secrets matching pattern
       */
      async listSecrets(pattern?: string): Promise<string[]> {
        switch (config.platform) {
          case 'aws':
            return listFromAWSSecretsManager(pattern);
          case 'cloudflare':
            return listFromCloudflareKV(config, pattern);
          case 'deno':
          case 'local':
          default:
            return Promise.resolve([]);
        }
      },

      /**
       * Clear cache (useful after rotation)
       */
      clearCache(key?: string): void {
        if (key === undefined) {
          cache.clear();
        } else {
          cache.delete(key);
        }
      },
    };
  },
};

/**
 * AWS Secrets Manager integration
 */
async function getFromAWSSecretsManager(key: string): Promise<string> {
  try {
    Logger.debug(`[AWS] Getting secret: ${key}`);
    throw ErrorFactory.createConfigError('AWS SDK not available in core - use wrapper module');
  } catch (error) {
    return Promise.reject(
      ErrorFactory.createTryCatchError(
        `Failed to retrieve secret from AWS: ${(error as Error).message}`,
        error
      )
    );
  }
}

async function setInAWSSecretsManager(
  key: string,
  _value: string,
  _options?: SetSecretOptions
): Promise<void> {
  Logger.info(`[AWS] Setting secret: ${key}`);
  return Promise.reject(
    ErrorFactory.createConfigError('AWS SDK not available in core - use wrapper module')
  );
}

async function deleteFromAWSSecretsManager(key: string): Promise<void> {
  Logger.info(`[AWS] Deleting secret: ${key}`);
  return Promise.reject(
    ErrorFactory.createConfigError('AWS SDK not available in core - use wrapper module')
  );
}

async function listFromAWSSecretsManager(pattern?: string): Promise<string[]> {
  Logger.info(`[AWS] Listing secrets with pattern: ${pattern ?? '*'}`);
  return Promise.resolve([]);
}

/**
 * Cloudflare KV integration
 */
async function getFromCloudflareKV(config: SecretConfig, key: string): Promise<string> {
  if (config.kv === undefined) {
    throw ErrorFactory.createConfigError('Cloudflare KV namespace not configured');
  }
  const value = await config.kv.get(key);
  if (value === null || value === '') {
    throw ErrorFactory.createNotFoundError(`Secret not found: ${key}`, { key });
  }
  return value;
}

async function setInCloudflareKV(
  config: SecretConfig,
  key: string,
  value: string,
  options?: SetSecretOptions
): Promise<void> {
  if (config.kv === undefined) {
    throw ErrorFactory.createConfigError('Cloudflare KV namespace not configured');
  }
  const ttl = options?.expirationTtl;
  await config.kv.put(key, value, { expirationTtl: ttl });
}

async function deleteFromCloudflareKV(config: SecretConfig, key: string): Promise<void> {
  if (config.kv === undefined) {
    throw ErrorFactory.createConfigError('Cloudflare KV namespace not configured');
  }
  await config.kv.delete(key);
}

async function listFromCloudflareKV(config: SecretConfig, pattern?: string): Promise<string[]> {
  if (config.kv === undefined) {
    throw ErrorFactory.createConfigError('Cloudflare KV namespace not configured');
  }
  const result = await config.kv.list({ prefix: pattern });
  return result.keys.map((k: { name: string }) => k.name);
}

/**
 * Deno environment integration
 */
async function getFromDenoEnv(key: string): Promise<string> {
  const value = (
    globalThis as unknown as Record<string, { env?: { get?: (key: string) => string } }>
  )['Deno']?.env?.get?.(key);
  if (value === undefined || value === null || value === '') {
    return Promise.reject(ErrorFactory.createNotFoundError(`Secret not found: ${key}`, { key }));
  }
  return Promise.resolve(value);
}

/**
 * Local environment variables (Node.js)
 */
async function getFromEnv(key: string): Promise<string> {
  const value = process.env[key];
  if (value === undefined || value === null || value === '') {
    return Promise.reject(ErrorFactory.createNotFoundError(`Secret not found: ${key}`, { key }));
  }
  return Promise.resolve(value);
}

/**
 * SecretsManager - Unified interface for retrieving secrets
 * Sealed namespace for immutability
 */
export const SecretsManager = Object.freeze({
  /**
   * Get or create singleton instance
   */
  getInstance(config?: SecretConfig): SecretsManagerInstance {
    if (instance === undefined && config !== undefined) {
      instance = SecretsManagerImpl.create(config);
    }
    if (instance === undefined) {
      throw ErrorFactory.createConfigError(
        'SecretsManager not initialized. Call getInstance(config) first.'
      );
    }
    return instance;
  },

  /**
   * Get secret value from appropriate backend
   */
  async getSecret(key: string, options?: GetSecretOptions): Promise<string> {
    return this.getInstance().getSecret(key, options);
  },

  /**
   * Set secret value
   */
  async setSecret(key: string, value: string, options?: SetSecretOptions): Promise<void> {
    return this.getInstance().setSecret(key, value, options);
  },

  /**
   * Delete secret
   */
  async deleteSecret(key: string): Promise<void> {
    return this.getInstance().deleteSecret(key);
  },

  /**
   * Rotate secret (trigger new secret generation)
   */
  async rotateSecret(key: string): Promise<void> {
    return this.getInstance().rotateSecret(key);
  },

  /**
   * Get all secrets matching pattern
   */
  async listSecrets(pattern?: string): Promise<string[]> {
    return this.getInstance().listSecrets(pattern);
  },

  /**
   * Clear cache (useful after rotation)
   */
  clearCache(key?: string): void {
    this.getInstance().clearCache(key);
  },
});

/**
 * Predefined secret keys
 * Sealed namespace for immutability
 */
export const SECRETS = Object.freeze({
  // Database credentials
  DB_USERNAME: 'db/username',
  // Secret identifier only (not a credential value)
  DB_PASSWORD: 'db/password', // NOSONAR (typescript:S2068) - secret key name, not hardcoded password
  DB_HOST: 'db/host',
  DB_PORT: 'db/port',
  DB_DATABASE: 'db/database',

  // API keys
  JWT_SECRET: 'jwt/secret',
  JWT_REFRESH_SECRET: 'jwt/refresh-secret',

  // Encryption
  ENCRYPTION_KEY: 'encryption/key',
  ENCRYPTION_IV: 'encryption/iv',

  // Third-party APIs
  STRIPE_API_KEY: 'stripe/api-key',
  STRIPE_WEBHOOK_SECRET: 'stripe/webhook-secret',
  SENDGRID_API_KEY: 'sendgrid/api-key',
  GITHUB_TOKEN: 'github/token',

  // Session/CSRF
  SESSION_SECRET: 'session/secret',
  CSRF_SECRET: 'csrf/secret',
} as const);

export interface GetSecretOptions {
  cacheTtl?: number; // Cache time-to-live in milliseconds
  throwIfMissing?: boolean;
}

export interface SetSecretOptions {
  expirationTtl?: number; // Expiration time-to-live in seconds
  metadata?: Record<string, unknown>;
}

/**
 * Helper to get database credentials using secrets manager
 */
export async function getDatabaseCredentials(): Promise<DatabaseCredentials> {
  const manager = SecretsManager.getInstance();

  return {
    username: await manager.getSecret(SECRETS.DB_USERNAME),
    password: await manager.getSecret(SECRETS.DB_PASSWORD),
    host: await manager.getSecret(SECRETS.DB_HOST),
    port: Number.parseInt(await manager.getSecret(SECRETS.DB_PORT), 10),
    database: await manager.getSecret(SECRETS.DB_DATABASE),
  };
}

/**
 * Helper to get JWT secrets
 */
export async function getJwtSecrets(): Promise<JwtSecrets> {
  const manager = SecretsManager.getInstance();

  return {
    secret: await manager.getSecret(SECRETS.JWT_SECRET),
    refreshSecret: await manager.getSecret(SECRETS.JWT_REFRESH_SECRET),
  };
}

export interface DatabaseCredentials {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

export interface JwtSecrets {
  secret: string;
  refreshSecret: string;
}
