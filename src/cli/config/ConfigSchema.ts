/**
 * Configuration Schema
 * Defines the structure and types for Zintrust configuration
 */

export interface DatabaseConfig {
  connection: 'sqlite' | 'postgres' | 'mysql' | 'mariadb';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  charset?: string;
  collation?: string;
  synchronize?: boolean;
  logging?: boolean;
}

export interface ServerConfig {
  port: number;
  host: string;
  environment: 'development' | 'production' | 'testing';
  debug: boolean;
  profiling: boolean;
  tracing: boolean;
}

export interface AuthConfig {
  enabled: boolean;
  strategy: 'jwt' | 'session' | 'apikey';
  jwtSecret?: string;
  sessionSecret?: string;
  expiresIn: string;
}

export interface MicroservicesConfig {
  enabled: boolean;
  port: number;
  apiGatewayPort?: number;
  discoveryType: 'filesystem' | 'consul' | 'kubernetes';
  healthCheckInterval: number;
}

export interface FeatureConfig {
  auth: boolean;
  database: boolean;
  cache: boolean;
  queue: boolean;
  storage: boolean;
  email: boolean;
  webhooks: boolean;
  monitoring: boolean;
}

export interface ProjectConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  database: DatabaseConfig;
  server: ServerConfig;
  auth: AuthConfig;
  microservices: MicroservicesConfig;
  features: FeatureConfig;
  [key: string]: unknown; // Allow additional custom config
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ProjectConfig = {
  name: 'zintrust-app',
  version: '1.0.0',
  description: 'A Zintrust application',
  author: 'Developer',
  database: {
    connection: 'sqlite',
    charset: 'utf8',
    collation: 'utf8_unicode_ci',
    synchronize: true,
    logging: false,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    environment: 'development',
    debug: false,
    profiling: false,
    tracing: false,
  },
  auth: {
    enabled: false,
    strategy: 'jwt',
    expiresIn: '7d',
  },
  microservices: {
    enabled: false,
    port: 3001,
    discoveryType: 'filesystem',
    healthCheckInterval: 30000,
  },
  features: {
    auth: false,
    database: true,
    cache: false,
    queue: false,
    storage: false,
    email: false,
    webhooks: false,
    monitoring: false,
  },
};

/**
 * Configuration paths
 */
const HOME_DIR = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
const GLOBAL_DIR = `${HOME_DIR}/.zintrust`;

export const ConfigPaths = {
  GLOBAL_DIR,
  GLOBAL_CONFIG: `${GLOBAL_DIR}/config.json`,
  PROJECT_CONFIG: '.zintrust.json',
  PROJECT_CONFIG_TS: 'zintrust.config.ts',
  ENV_FILE: '.env',
  ENV_EXAMPLE: '.env.example',
} as const;

/**
 * Validation rule interface
 */
export interface ValidationRule {
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  enum?: string[];
  description?: string;
}

/**
 * Validation rules for each config section
 */
export const CONFIG_RULES: Record<string, ValidationRule> = {
  name: {
    type: 'string',
    required: true,
    minLength: 3,
    maxLength: 100,
    pattern: /^[a-z\d\-_]+$/i,
    description: 'Project name (alphanumeric, hyphens, underscores)',
  },
  version: {
    type: 'string',
    required: true,
    // SemVer: MAJOR.MINOR.PATCH with optional -prerelease and +build metadata
    // Avoids `.*` patterns (Sonar S5852: potential super-linear backtracking).
    pattern: /^\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?(?:\+[\dA-Za-z.-]+)?$/,
    description: 'Semantic version (e.g. 1.0.0)',
  },
  'server.port': {
    type: 'number',
    required: true,
    min: 1024,
    max: 65535,
    description: 'Server port (1024-65535)',
  },
  'server.environment': {
    type: 'string',
    required: true,
    enum: ['development', 'production', 'testing'],
    description: 'Deployment environment',
  },
  'database.connection': {
    type: 'string',
    required: true,
    enum: ['sqlite', 'postgres', 'mysql', 'mariadb'],
    description: 'Database type',
  },
  'auth.strategy': {
    type: 'string',
    required: true,
    enum: ['jwt', 'session', 'apikey'],
    description: 'Authentication strategy',
  },
  'microservices.discoveryType': {
    type: 'string',
    required: true,
    enum: ['filesystem', 'consul', 'kubernetes'],
    description: 'Service discovery method',
  },
};

/**
 * Get default config for a specific key
 */
export function getDefaultValue(key: string): unknown {
  const keys = key.split('.');
  let value: unknown = DEFAULT_CONFIG;

  for (const k of keys) {
    if (typeof value === 'object' && value !== null && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Set config value in object (deep set)
 */
export function setConfigValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys.at(-1);
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }
}

/**
 * Get config value from object (deep get)
 */
export function getConfigValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (
      typeof current === 'object' &&
      current !== null &&
      key in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}
