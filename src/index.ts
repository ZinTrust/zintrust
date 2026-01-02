/**
 * Zintrust Framework - Production-Grade TypeScript Backend
 * Built for performance, type safety, and exceptional developer experience
 */

export { Application } from '@boot/Application';
export { Server } from '@boot/Server';
export { ServiceContainer } from '@container/ServiceContainer';
export { Controller } from '@http/Controller';
export { Kernel } from '@http/Kernel';
export { Request } from '@http/Request';
export type { IRequest } from '@http/Request';
export { Response } from '@http/Response';
export type { IResponse } from '@http/Response';
export { CsrfMiddleware } from '@middleware/CsrfMiddleware';
export { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
export { LoggingMiddleware } from '@middleware/LoggingMiddleware';
export { MiddlewareStack } from '@middleware/MiddlewareStack';
export type { Middleware } from '@middleware/MiddlewareStack';
export { RateLimiter } from '@middleware/RateLimiter';
export { SecurityMiddleware } from '@middleware/SecurityMiddleware';
export { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
export { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
export { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
export { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
export { Database, resetDatabase, useDatabase } from '@orm/Database';
export { Model } from '@orm/Model';
export type { IModel, ModelConfig, ModelStatic } from '@orm/Model';
export { QueryBuilder } from '@orm/QueryBuilder';
export type { IRelationship } from '@orm/Relationships';

// Adapter registry (for external adapter packages)
export { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
export { Router } from '@routing/Router';
export type { IRouter } from '@routing/Router';

// Common
export { delay, ensureDirSafe } from '@common/index';

// HTTP Client
export { HttpClient } from '@httpClient/Http';
export type { IHttpRequest, IHttpResponse } from '@httpClient/Http';

// Database adapter types
export type { DatabaseConfig, ID1Database } from '@orm/DatabaseAdapter';

// Profiling
export { MemoryProfiler } from '@profiling/MemoryProfiler';
export { N1Detector } from '@profiling/N1Detector';
export { QueryLogger } from '@profiling/QueryLogger';
export { RequestProfiler } from '@profiling/RequestProfiler';
export type {
  MemoryDelta,
  MemorySnapshot,
  N1Pattern,
  ProfileReport,
  QueryLogEntry,
} from '@profiling/types';

// Validation
export { ValidationError } from '@validation/ValidationError';
export type { FieldError } from '@validation/ValidationError';
export { Schema, Validator } from '@validation/Validator';
export type { ISchema, SchemaType } from '@validation/Validator';

// Security
export { CsrfTokenManager } from '@security/CsrfTokenManager';
export type {
  CsrfTokenData,
  CsrfTokenManagerType,
  ICsrfTokenManager,
} from '@security/CsrfTokenManager';
export { Encryptor } from '@security/Encryptor';
export { Hash } from '@security/Hash';
export { JwtManager } from '@security/JwtManager';
export type {
  IJwtManager,
  JwtAlgorithm,
  JwtManagerType,
  JwtOptions,
  JwtPayload,
} from '@security/JwtManager';
export { Xss } from '@security/Xss';
export { XssProtection } from '@security/XssProtection';

// Exceptions
export { ErrorFactory } from '@exceptions/ZintrustError';

// Config (core-owned)
export { Env } from '@config/env';
export { Logger } from '@config/logger';

export { appConfig } from '@config/app';
export type { AppConfig } from '@config/app';

export { cacheConfig } from '@config/cache';
export type { CacheConfig } from '@config/cache';

export { databaseConfig } from '@config/database';
export type { DatabaseConfig as DatabaseRuntimeConfig } from '@config/database';

export { microservicesConfig } from '@config/microservices';
export type { MicroservicesConfig } from '@config/microservices';

export { middlewareConfig } from '@config/middleware';
export type { MiddlewareConfigType } from '@config/type';

export { queueConfig } from '@config/queue';
export type { QueueConfig } from '@config/queue';

export { securityConfig } from '@config/security';

export { mailConfig } from '@config/mail';
export type { MailConfig } from '@config/mail';

export { storageConfig } from '@config/storage';
export type { StorageConfig } from '@config/storage';

export { startupConfig } from '@config/startup';
export type { StartupConfig } from '@config/startup';

export { Constants, DEFAULTS, ENV_KEYS, HTTP_HEADERS, MIME_TYPES } from '@config/constants';
export { FeatureFlags } from '@config/features';

export { Cloudflare } from '@config/cloudflare';
export { SecretsManager } from '@config/SecretsManager';
export type { MailDriverConfig, MailDriverName, WorkersEnv } from '@config/type';

// Config (validation)
export { StartupConfigValidator } from '@config/StartupConfigValidator';

// Mail
export { Mail } from '@mail/Mail';
export type { SendMailInput, SendMailResult } from '@mail/Mail';

export { SmtpDriver } from '@mail/drivers/Smtp';
export type { SmtpConfig as SmtpDriverConfig } from '@mail/drivers/Smtp';

// Notifications
export { sendSlackWebhook } from '@tools/notification/drivers/Slack';
export { sendSms } from '@tools/notification/drivers/Twilio';

// Health & Runtime (for scaffolded routes and health checks)
export { RuntimeHealthProbes } from '@/health/RuntimeHealthProbes';

// Broadcast (for real-time features)
export { Broadcast } from '@tools/broadcast/Broadcast';

// Storage (for file management and signed URLs)
export { Storage } from '@tools/storage/index';
export { LocalSignedUrl } from '@tools/storage/LocalSignedUrl';

// NOTE: Node-only exports (like FileLogWriter, process) are intentionally not
// exported from this root entrypoint. Use the '@zintrust/core/node' subpath.
