/**
 * Unified Secrets Management Layer
 * Abstracts secrets retrieval across different cloud platforms
 * Supports: AWS Secrets Manager, Parameter Store, Cloudflare KV, Deno env
 */

import { Logger } from '@config/logger';

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

class SecretsManagerImpl implements SecretsManagerInstance {
  private readonly config: SecretConfig;
  private readonly cache: Map<string, { value: string; expiresAt: number }> = new Map();

  constructor(config: SecretConfig) {
    this.config = config;
  }

  /**
   * Get secret value from appropriate backend
   */
  async getSecret(key: string, options?: GetSecretOptions): Promise<string> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let value: string;

    switch (this.config.platform) {
      case 'aws':
        value = await this.getFromAWSSecretsManager(key);
        break;
      case 'cloudflare':
        value = await this.getFromCloudflareKV(key);
        break;
      case 'deno':
        value = await this.getFromDenoEnv(key);
        break;
      case 'local':
      default:
        value = await this.getFromEnv(key);
    }

    // Cache the value
    const ttl = options?.cacheTtl ?? 3600000; // 1 hour default
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });

    return value;
  }

  /**
   * Set secret value
   */
  async setSecret(key: string, value: string, options?: SetSecretOptions): Promise<void> {
    switch (this.config.platform) {
      case 'aws':
        await this.setInAWSSecretsManager(key, value, options);
        break;
      case 'cloudflare':
        await this.setInCloudflareKV(key, value, options);
        break;
      case 'deno':
        throw new Error('Cannot set secrets in Deno environment');
      case 'local':
      default:
        throw new Error('Cannot set secrets in local environment');
    }

    // Invalidate cache
    this.cache.delete(key);
  }

  /**
   * Delete secret
   */
  async deleteSecret(key: string): Promise<void> {
    switch (this.config.platform) {
      case 'aws':
        await this.deleteFromAWSSecretsManager(key);
        break;
      case 'cloudflare':
        await this.deleteFromCloudflareKV(key);
        break;
      case 'deno':
      case 'local':
      default:
        throw new Error('Cannot delete secrets in this environment');
    }

    // Invalidate cache
    this.cache.delete(key);
  }

  /**
   * Rotate secret (trigger new secret generation)
   */
  async rotateSecret(_key: string): Promise<void> {
    if (this.config.platform === 'aws') {
      // AWS Secrets Manager supports automatic rotation
      throw new Error('Secret rotation not implemented');
    }
    throw new Error('Secret rotation not supported on this platform');
  }

  /**
   * Get all secrets matching pattern
   */
  async listSecrets(pattern?: string): Promise<string[]> {
    switch (this.config.platform) {
      case 'aws':
        return this.listFromAWSSecretsManager(pattern);
      case 'cloudflare':
        return this.listFromCloudflareKV(pattern);
      case 'deno':
      case 'local':
      default:
        return [];
    }
  }

  /**
   * AWS Secrets Manager integration
   */
  private async getFromAWSSecretsManager(key: string): Promise<string> {
    try {
      // Would use AWS SDK (cannot add external deps in core)
      // This is a placeholder showing the pattern
      Logger.debug(`[AWS] Getting secret: ${key}`);
      throw new Error('AWS SDK not available in core - use wrapper module');
    } catch (error) {
      Logger.error(`Failed to retrieve secret from AWS:`, error as Error);
      throw new Error(`Failed to retrieve secret from AWS: ${(error as Error).message}`);
    }
  }

  private async setInAWSSecretsManager(
    key: string,
    _value: string,
    _options?: SetSecretOptions
  ): Promise<void> {
    Logger.info(`[AWS] Setting secret: ${key}`);
    throw new Error('AWS SDK not available in core - use wrapper module');
  }

  private async deleteFromAWSSecretsManager(key: string): Promise<void> {
    Logger.info(`[AWS] Deleting secret: ${key}`);
    throw new Error('AWS SDK not available in core - use wrapper module');
  }

  private async listFromAWSSecretsManager(pattern?: string): Promise<string[]> {
    Logger.info(`[AWS] Listing secrets with pattern: ${pattern ?? '*'}`);
    return [];
  }

  /**
   * Cloudflare KV integration
   */
  private async getFromCloudflareKV(key: string): Promise<string> {
    if (this.config.kv === undefined) {
      throw new Error('Cloudflare KV namespace not configured');
    }
    const value = await this.config.kv.get(key);
    if (value === null || value === '') {
      throw new Error(`Secret not found: ${key}`);
    }
    return value;
  }

  private async setInCloudflareKV(
    key: string,
    value: string,
    options?: SetSecretOptions
  ): Promise<void> {
    if (this.config.kv === undefined) {
      throw new Error('Cloudflare KV namespace not configured');
    }
    const ttl = options?.expirationTtl;
    await this.config.kv.put(key, value, { expirationTtl: ttl });
  }

  private async deleteFromCloudflareKV(key: string): Promise<void> {
    if (this.config.kv === undefined) {
      throw new Error('Cloudflare KV namespace not configured');
    }
    await this.config.kv.delete(key);
  }

  private async listFromCloudflareKV(pattern?: string): Promise<string[]> {
    if (this.config.kv === undefined) {
      throw new Error('Cloudflare KV namespace not configured');
    }
    const result = await this.config.kv.list({ prefix: pattern });
    return result.keys.map((k: { name: string }) => k.name);
  }

  /**
   * Deno environment integration
   */
  private async getFromDenoEnv(key: string): Promise<string> {
    const value = (
      globalThis as unknown as Record<string, { env?: { get?: (key: string) => string } }>
    )['Deno']?.env?.get?.(key);
    if (value === undefined || value === null || value === '') {
      throw new Error(`Secret not found: ${key}`);
    }
    return value;
  }

  /**
   * Local environment variables (Node.js)
   */
  private async getFromEnv(key: string): Promise<string> {
    const value = process.env[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Secret not found: ${key}`);
    }
    return value;
  }

  /**
   * Clear cache (useful after rotation)
   */
  clearCache(key?: string): void {
    if (key === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(key);
    }
  }
}

/**
 * SecretsManager - Unified interface for retrieving secrets
 */
export const SecretsManager = {
  /**
   * Get or create singleton instance
   */
  getInstance(config?: SecretConfig): SecretsManagerInstance {
    if (instance === undefined && config !== undefined) {
      instance = new SecretsManagerImpl(config);
    }
    if (instance === undefined) {
      throw new Error('SecretsManager not initialized. Call getInstance(config) first.');
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
};

/**
 * Predefined secret keys
 */
export const SECRETS = {
  // Database credentials
  DB_USERNAME: 'db/username',
  DB_PASSWORD: 'db/password',
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
} as const;

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
