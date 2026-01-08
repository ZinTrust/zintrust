import { Env } from '@config/env';
import type { Middleware as MiddlewareFn } from '@middleware/MiddlewareStack';

export type Environment =
  | 'development'
  | 'dev'
  | 'production'
  | 'prod'
  | 'pro'
  | 'testing'
  | 'test';
export type StartMode = 'development' | 'production' | 'testing';

export type EnvGetValue = ReturnType<typeof Env.get>;
export type EnvGetBoolValue = ReturnType<typeof Env.getBool>;

export type LocalStorageDriverConfig = {
  driver: 'local';
  root: EnvGetValue;
  url: EnvGetValue;
  visibility: EnvGetValue;
};

export type S3StorageDriverConfig = {
  driver: 's3';
  accessKeyId: EnvGetValue;
  secretAccessKey: EnvGetValue;
  region: typeof Env.AWS_REGION;
  bucket: EnvGetValue;
  url: EnvGetValue;
  endpoint: EnvGetValue;
  usePathStyleUrl: EnvGetBoolValue;
};

export type R2StorageDriverConfig = {
  driver: 'r2';
  accessKeyId: EnvGetValue;
  secretAccessKey: EnvGetValue;
  region: EnvGetValue;
  bucket: EnvGetValue;
  endpoint: EnvGetValue;
  url: EnvGetValue;
};

export type GcsStorageDriverConfig = {
  driver: 'gcs';
  projectId: EnvGetValue;
  keyFile: EnvGetValue;
  bucket: EnvGetValue;
  url: EnvGetValue;
};

export type StorageDriverConfig =
  | LocalStorageDriverConfig
  | S3StorageDriverConfig
  | R2StorageDriverConfig
  | GcsStorageDriverConfig;

export type StorageDrivers = Record<string, StorageDriverConfig>;

export type StorageDriverName = keyof StorageDrivers;

export type StorageConfigRuntime = {
  readonly default: string;
  readonly drivers: StorageDrivers;
};

export type StartupConfigValidationError = {
  key: string;
  value: unknown;
  message: string;
};

export type StartupConfigValidationResult = {
  valid: boolean;
  errors: StartupConfigValidationError[];
};

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

export interface GetSecretOptions {
  cacheTtl?: number; // Cache time-to-live in milliseconds
  throwIfMissing?: boolean;
}

export interface SetSecretOptions {
  expirationTtl?: number; // Expiration time-to-live in seconds
  metadata?: Record<string, unknown>;
}

export interface SecretsManagerInstance {
  getSecret(key: string, options?: GetSecretOptions): Promise<string>;
  setSecret(key: string, value: string, options?: SetSecretOptions): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  rotateSecret(key: string): Promise<void>;
  listSecrets(pattern?: string): Promise<string[]>;
  clearCache(key?: string): void;
}

export type QueueDriverName = 'sync' | 'database' | 'redis' | 'rabbitmq' | 'sqs';

export type SyncQueueDriverConfig = {
  driver: 'sync';
};

export type DatabaseQueueDriverConfig = {
  driver: 'database';
  table: string;
  connection: string;
};

export type RedisQueueDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  password?: string;
  database: number;
};

export type RabbitMqQueueDriverConfig = {
  driver: 'rabbitmq';
  host: string;
  port: number;
  username: string;
  password: string;
  vhost: string;
};

export type SqsQueueDriverConfig = {
  driver: 'sqs';
  key?: string;
  secret?: string;
  region: string;
  queueUrl?: string;
};

export type QueueDriversConfig = {
  sync: SyncQueueDriverConfig;
  database: DatabaseQueueDriverConfig;
  redis: RedisQueueDriverConfig;
  rabbitmq: RabbitMqQueueDriverConfig;
  sqs: SqsQueueDriverConfig;
};

export type QueueConfigWithDrivers = {
  default: QueueDriverName;
  drivers: QueueDriversConfig;
};

export type KnownNotificationDriverName = 'console' | 'termii' | 'twilio' | 'slack';

export type ConsoleNotificationDriverConfig = { driver: 'console' };

export type TermiiNotificationDriverConfig = {
  driver: 'termii';
  apiKey: string;
  sender: string;
  endpoint: string;
};

export type TwilioNotificationDriverConfig = {
  driver: 'twilio';
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export type SlackNotificationDriverConfig = {
  driver: 'slack';
  webhookUrl: string;
};

export type KnownNotificationDriverConfig =
  | ConsoleNotificationDriverConfig
  | TermiiNotificationDriverConfig
  | TwilioNotificationDriverConfig
  | SlackNotificationDriverConfig;

export type NotificationDrivers = Record<string, KnownNotificationDriverConfig>;

export type NotificationConfigInput = {
  default: string;
  drivers: NotificationDrivers;
};

export type NotificationProviders = {
  console: ConsoleNotificationDriverConfig;
  termii: TermiiNotificationDriverConfig;
  twilio: TwilioNotificationDriverConfig;
  slack: SlackNotificationDriverConfig;
};

export type MiddlewareConfigType = {
  global: MiddlewareFn[];
  route: Record<string, MiddlewareFn>;
};

export type MailDriverName = 'disabled' | 'sendgrid' | 'smtp' | 'ses' | 'mailgun' | 'nodemailer';

export type DisabledMailDriverConfig = {
  driver: 'disabled';
};

export type SendGridMailDriverConfig = {
  driver: 'sendgrid';
  apiKey: string;
};

export type MailgunMailDriverConfig = {
  driver: 'mailgun';
  apiKey: string;
  domain: string;
  baseUrl: string;
};

// Placeholders for future drivers (kept config-first)
export type SmtpMailDriverConfig = {
  driver: 'smtp';
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean | 'starttls';
};

export type NodemailerMailDriverConfig = {
  driver: 'nodemailer';
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean | 'starttls';
};

export type SesMailDriverConfig = {
  driver: 'ses';
  region: string;
};

export type MailDriverConfig =
  | DisabledMailDriverConfig
  | SendGridMailDriverConfig
  | MailgunMailDriverConfig
  | SmtpMailDriverConfig
  | NodemailerMailDriverConfig
  | SesMailDriverConfig;

export type MailDrivers = Record<string, MailDriverConfig>;

export type MailConfigInput = {
  /**
   * Default mailer key name.
   *
   * This is intentionally a string to support named mailers (e.g. 'transactional', 'marketing').
   * The underlying driver is selected by the `driver` field within each mailer config.
   */
  default: string;
  from: {
    address: string;
    name: string;
  };
  drivers: MailDrivers;
};

export type ProcessLike = {
  env?: Record<string, string | undefined>;
  execPath?: string;
  platform?: string;
};

export type SqliteConnectionConfig = {
  driver: 'sqlite';
  database: string;
  migrations: string;
};

export type PostgresqlConnectionConfig = {
  driver: 'postgresql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  pooling: {
    enabled: boolean;
    min: number;
    max: number;
    idleTimeout: number;
    connectionTimeout: number;
  };
};

export type MysqlConnectionConfig = {
  driver: 'mysql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  pooling: {
    enabled: boolean;
    min: number;
    max: number;
  };
};

export type D1ConnectionConfig = {
  driver: 'd1';
};

export type D1RemoteConnectionConfig = {
  driver: 'd1-remote';
};

export type DatabaseConnectionConfig =
  | SqliteConnectionConfig
  | PostgresqlConnectionConfig
  | MysqlConnectionConfig
  | D1ConnectionConfig
  | D1RemoteConnectionConfig;

/**
 * Named database connection configs.
 *
 * Keys represent connection names (e.g. 'default', 'auth', 'tasks', 'db1').
 */
export type DatabaseConnections = Record<string, DatabaseConnectionConfig>;

/**
 * Default connection name.
 */
export type DatabaseConfigShape = {
  default: string;
  connections: DatabaseConnections;
};

export type WorkersEnv = Record<string, unknown>;

export type KVNamespace = {
  get(
    key: string,
    options?: { type: 'text' | 'json' | 'arrayBuffer' | 'stream' }
  ): Promise<unknown>;
  put(
    key: string,
    value: string | ReadableStream | ArrayBuffer | FormData,
    options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

export type MemoryCacheDriverConfig = {
  driver: 'memory';
  ttl: number;
};

export type RedisCacheDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  ttl: number;
};

export type MongoCacheDriverConfig = {
  driver: 'mongodb';
  uri: string;
  db: string;
  ttl: number;
};

export type KvCacheDriverConfig = {
  driver: 'kv';
  ttl: number;
};

export type KvRemoteCacheDriverConfig = {
  driver: 'kv-remote';
  ttl: number;
};

export type CacheDriverConfig =
  | MemoryCacheDriverConfig
  | RedisCacheDriverConfig
  | MongoCacheDriverConfig
  | KvCacheDriverConfig
  | KvRemoteCacheDriverConfig;

export type CacheDrivers = Record<string, CacheDriverConfig>;

export type CacheConfigInput = {
  default: string;
  drivers: CacheDrivers;
};

export type KnownBroadcastDriverName = 'inmemory' | 'pusher' | 'redis' | 'redishttps';

export type InMemoryBroadcastDriverConfig = {
  driver: 'inmemory';
};

export type PusherBroadcastDriverConfig = {
  driver: 'pusher';
  appId: string;
  key: string;
  secret: string;
  cluster: string;
  useTLS: boolean;
};

export type RedisBroadcastDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  password: string;
  channelPrefix: string;
};

export type RedisHttpsBroadcastDriverConfig = {
  driver: 'redishttps';
  endpoint: string;
  token: string;
  channelPrefix: string;
};

export type KnownBroadcastDriverConfig =
  | InMemoryBroadcastDriverConfig
  | PusherBroadcastDriverConfig
  | RedisBroadcastDriverConfig
  | RedisHttpsBroadcastDriverConfig;

export type BroadcastDrivers = Record<string, KnownBroadcastDriverConfig>;

export type BroadcastConfigInput = {
  default: string;
  drivers: BroadcastDrivers;
};
