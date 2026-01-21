/**
 * ZinTrust Framework - Production-Grade TypeScript Backend
 * Built for performance, type safety, and exceptional developer experience
 */

import { Application } from '@boot/Application';
import { AwsSigV4 } from '@common/index';
import { SignedRequest } from '@security/SignedRequest';

const ZintrustApplication = Application;
const ZintrustAwsSigV4 = AwsSigV4;
const ZintrustSignedRequest = SignedRequest;

export { Server } from '@boot/Server';
export { ServiceContainer } from '@container/ServiceContainer';
export { createPaginator, getNextPageUrl, getPrevPageUrl, Paginator } from '@database/Paginator';
export type {
  CreatePaginatorInput,
  PaginationLinks,
  PaginationQuery,
  Paginator as PaginatorType,
} from '@database/Paginator';
export { Controller } from '@http/Controller';
export { FileUpload } from '@http/FileUpload';
export type { FileUploadOptions, IFileUploadHandler, UploadedFile } from '@http/FileUpload';
export { Kernel } from '@http/Kernel';
export { bodyParsingMiddleware } from '@http/middleware/BodyParsingMiddleware';
export { fileUploadMiddleware } from '@http/middleware/FileUploadMiddleware';
export { BodyParsers } from '@http/parsers/BodyParsers';
export { MultipartParser } from '@http/parsers/MultipartParser';
export { MultipartParserRegistry } from '@http/parsers/MultipartParserRegistry';
export type {
  MultipartFieldValue,
  MultipartParseInput,
  MultipartParserProvider,
  ParsedMultipartData,
} from '@http/parsers/MultipartParserRegistry';
export { Request } from '@http/Request';
export type { IRequest, ValidatedRequest } from '@http/Request';
export { RequestContext } from '@http/RequestContext';
export { Response } from '@http/Response';
export type { IResponse } from '@http/Response';
export {
  getValidatedBody,
  getValidatedHeaders,
  getValidatedParams,
  getValidatedQuery,
  hasValidatedBody,
  requireValidatedBody,
  ValidationHelper,
} from '@http/ValidationHelper';
export { CsrfMiddleware } from '@middleware/CsrfMiddleware';
export { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
export { LoggingMiddleware } from '@middleware/LoggingMiddleware';
export { MiddlewareStack } from '@middleware/MiddlewareStack';
export type { Middleware } from '@middleware/MiddlewareStack';
export { RateLimiter } from '@middleware/RateLimiter';
export { SecurityMiddleware } from '@middleware/SecurityMiddleware';
export { SessionMiddleware } from '@middleware/SessionMiddleware';
export { ValidationMiddleware } from '@middleware/ValidationMiddleware';
export { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
export { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
export { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
export { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
export { Database, resetDatabase, useDatabase, useEnsureDbConnected } from '@orm/Database';
export type { IDatabase } from '@orm/Database';
export { Model } from '@orm/Model';
export type { IModel, ModelConfig, ModelStatic } from '@orm/Model';
export { QueryBuilder } from '@orm/QueryBuilder';
export type { InsertResult, IQueryBuilder, PaginationOptions } from '@orm/QueryBuilder';
export type { IRelationship } from '@orm/Relationships';
export { ZintrustApplication as Application };

// Time Utilities
export { DateTime } from '@time/DateTime';
export type { IDateTime } from '@time/DateTime';

// Migrations
// Note: `Schema` is already exported by Validation. We expose the migration schema runtime
// as `MigrationSchema` to avoid name collisions.
export { Schema as MigrationSchema, type Blueprint } from '@migrations/schema';

// Adapter registry (for external adapter packages)
export { OpenApiGenerator } from '@/openapi/OpenApiGenerator';
export type { OpenApiGeneratorOptions } from '@/openapi/OpenApiGenerator';
export { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
export { Router } from '@routing/Router';
export type { IRouter } from '@routing/Router';
export { normalizeRouteMeta, RouteRegistry } from '@routing/RouteRegistry';
export type { RouteMeta, RouteMetaInput, RouteRegistration } from '@routing/RouteRegistry';

// Common
export {
  generateSecureJobId,
  generateUuid,
  getString,
  Utilities,
  type UtilitiesType,
} from '@/common/utility';
export { delay, ensureDirSafe } from '@common/index';
export { ZintrustAwsSigV4 as AwsSigV4 };

// Collections
export { collect, Collection } from '@/collections/index';
export type { ICollection, PrimitiveKey } from '@/collections/index';

// HTTP Client
export { HttpClient } from '@httpClient/Http';
export type { IHttpRequest, IHttpResponse } from '@httpClient/Http';

// Database adapter types
export type {
  DatabaseConfig,
  ID1Database,
  IDatabaseAdapter,
  QueryResult,
} from '@orm/DatabaseAdapter';

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

// Performance
export {
  GenerationCache,
  LazyLoader,
  Memoize,
  ParallelGenerator,
  PerformanceOptimizer,
  runAll,
  runBatch,
} from '@performance/Optimizer';
export type { IGenerationCache, ILazyLoader, IPerformanceOptimizer } from '@performance/Optimizer';

// Observability
export { OpenTelemetry } from '@/observability/OpenTelemetry';
export { PrometheusMetrics } from '@/observability/PrometheusMetrics';
export type {
  ObserveDbQueryInput,
  ObserveHttpRequestInput,
} from '@/observability/PrometheusMetrics';

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
export { EncryptedEnvelope } from '@security/EncryptedEnvelope';
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
export { PasswordResetTokenBroker } from '@security/PasswordResetTokenBroker';
export type {
  IPasswordResetTokenBroker,
  IPasswordResetTokenStore,
  PasswordResetTokenBrokerOptions,
  PasswordResetTokenBrokerType,
  PasswordResetTokenRecord,
} from '@security/PasswordResetTokenBroker';
export { createSanitizer, Sanitizer, type SanitizerType } from '@security/Sanitizer';
export { TokenRevocation } from '@security/TokenRevocation';
export { Xss } from '@security/Xss';
export { XssProtection } from '@security/XssProtection';
export { ZintrustSignedRequest as SignedRequest };

// Exceptions
export { ErrorFactory } from '@exceptions/ZintrustError';

// Events
export { EventDispatcher } from '@events/EventDispatcher';
export type { EventListener, EventMap, IEventDispatcher } from '@events/EventDispatcher';

// Sessions
export { SessionManager } from '@session/SessionManager';
export type {
  ISession,
  ISessionManager,
  SessionData,
  SessionManagerOptions,
} from '@session/SessionManager';

// Config (core-owned)
export { Env } from '@config/env';
export { Logger } from '@config/logger';

export { appConfig } from '@config/app';
export type { AppConfig } from '@config/app';

export { cacheConfig } from '@config/cache';
export type { CacheConfig, CacheConfigOverrides } from '@config/cache';

// Cache helpers
export { Cache, cache } from '@cache/Cache';
export type { CacheDriver } from '@cache/CacheDriver';

export { registerCachesFromRuntimeConfig } from '@cache/CacheRuntimeRegistration';

// Cache driver registry (for external driver packages)
export { CacheDriverRegistry } from '@cache/CacheDriverRegistry';

export { databaseConfig } from '@config/database';
export type {
  DatabaseConfigOverrides,
  DatabaseConfig as DatabaseRuntimeConfig,
} from '@config/database';
export { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';

export { microservicesConfig } from '@config/microservices';
export type { MicroservicesConfig } from '@config/microservices';

// Microservices
export { MicroserviceBootstrap } from '@microservices/MicroserviceBootstrap';
export type { IMicroserviceBootstrap, ServiceConfig } from '@microservices/MicroserviceBootstrap';
export { MicroserviceManager } from '@microservices/MicroserviceManager';
export type { IMicroserviceManager, MicroserviceConfig } from '@microservices/MicroserviceManager';
export { RequestTracingMiddleware } from '@microservices/RequestTracingMiddleware';
export { ServiceAuthMiddleware } from '@microservices/ServiceAuthMiddleware';
export { HealthCheckHandler, ServiceHealthMonitor } from '@microservices/ServiceHealthMonitor';
export type {
  AggregatedHealthStatus,
  HealthCheckResult,
  IServiceHealthMonitor,
} from '@microservices/ServiceHealthMonitor';

export { middlewareConfig, MiddlewareKeys } from '@config/middleware';
export type { MiddlewareKey } from '@config/middleware';
export type { MiddlewareConfigType } from '@config/type';

export { queueConfig } from '@config/queue';
export type { QueueConfig, QueueConfigOverrides } from '@config/queue';

export { default as broadcastConfig } from '@config/broadcast';
export type { BroadcastConfigOverrides } from '@config/broadcast';
export { default as notificationConfig } from '@config/notification';
export type { NotificationConfig, NotificationConfigOverrides } from '@config/notification';

export { securityConfig } from '@config/security';

export { mailConfig } from '@config/mail';
export type { MailConfig, MailConfigOverrides } from '@config/mail';

export { storageConfig } from '@config/storage';
export type { StorageConfig, StorageConfigOverrides } from '@config/storage';

export { startupConfig } from '@config/startup';
export type { StartupConfig } from '@config/startup';

export { Constants, DEFAULTS, ENV_KEYS, HTTP_HEADERS, MIME_TYPES } from '@config/constants';
export { FeatureFlags } from '@config/features';

export { Cloudflare } from '@config/cloudflare';
export {
  getDatabaseCredentials,
  getJwtSecrets,
  SECRETS,
  SecretsManager,
} from '@config/SecretsManager';
export type { DatabaseCredentials, JwtSecrets } from '@config/SecretsManager';
export type { MailDriverConfig, MailDriverName, WorkersEnv } from '@config/type';

// Config (validation)
export { StartupConfigValidator } from '@config/StartupConfigValidator';

// Mail
export { Mail } from '@mail/Mail';
export type { SendMailInput, SendMailResult } from '@mail/Mail';

export { MailTemplateRenderer, MailTemplates } from '@mail/templates';
export type { MailTemplate, MailTemplateRegistry } from '@mail/templates';

// Mail driver registry (for external driver packages)
export { MailDriverRegistry } from '@mail/MailDriverRegistry';
export { registerQueuesFromRuntimeConfig } from '@tools/queue/QueueRuntimeRegistration';

export { SmtpDriver } from '@mail/drivers/Smtp';
export type { SmtpConfig as SmtpDriverConfig } from '@mail/drivers/Smtp';

export { SendGridDriver } from '@mail/drivers/SendGrid';
export type {
  SendGridConfig,
  MailAddress as SendGridMailAddress,
  MailAttachment as SendGridMailAttachment,
  MailMessage as SendGridMailMessage,
  SendResult as SendGridSendResult,
} from '@mail/drivers/SendGrid';

export { MailgunDriver } from '@mail/drivers/Mailgun';
export type {
  MailgunConfig,
  MailMessage as MailgunMessage,
  SendResult as MailgunResult,
} from '@mail/drivers/Mailgun';

// Notifications
export { sendSlackWebhook } from '@tools/notification/drivers/Slack';
export { TermiiDriver } from '@tools/notification/drivers/Termii';
export { sendSms } from '@tools/notification/drivers/Twilio';
export { Notification } from '@tools/notification/Notification';
export { NotificationRegistry } from '@tools/notification/Registry';

// Templates
export { MarkdownRenderer } from '@tools/templates';

// Health & Runtime (for scaffolded routes and health checks)
export { RuntimeHealthProbes } from '@/health/RuntimeHealthProbes';

// Broadcast (for real-time features)
export { Broadcast } from '@tools/broadcast/Broadcast';
export { BroadcastRegistry } from '@tools/broadcast/BroadcastRegistry';
export { registerBroadcastersFromRuntimeConfig } from '@tools/broadcast/BroadcastRuntimeRegistration';
export { BroadcastWorker } from '@zintrust/workers';

// Notification Workers
export { NotificationWorker } from '@zintrust/workers';

// Storage (for file management and signed URLs)
export { Storage } from '@tools/storage/index';
export { LocalSignedUrl } from '@tools/storage/LocalSignedUrl';
export { StorageDriverRegistry } from '@tools/storage/StorageDriverRegistry';

export { S3Driver } from '@tools/storage/drivers/S3';
export type { S3Config } from '@tools/storage/drivers/S3';

export { R2Driver } from '@tools/storage/drivers/R2';
export type { R2Config } from '@tools/storage/drivers/R2';

export { GcsDriver } from '@tools/storage/drivers/Gcs';
export type { GcsConfig } from '@tools/storage/drivers/Gcs';

// Queue drivers (for external registration packages)
export { RedisQueue } from '@tools/queue/drivers/Redis';
export { Queue } from '@tools/queue/Queue';
export type { QueueMessage } from '@tools/queue/Queue';

// Seeders (for database seeding)
export { SeederLoader } from '@/seeders/SeederLoader';
export type { LoadedSeeder, SeederHandler } from '@/seeders/types';

// Schedules
export { default as logCleanup } from '@schedules/log-cleanup';

// Node Singletons (cross-runtime wrappers for Node.js APIs)
export * as NodeSingletons from '@node-singletons/index';

// Auth features
export { Auth } from '@features/Auth';

// Microservice utilities
export { MicroserviceGenerator } from '@microservices/MicroserviceGenerator';
export type {
  GenerateServiceOptions,
  IMicroserviceGenerator,
} from '@microservices/MicroserviceGenerator';

// CLI utilities (for build tools and scripting)
export { BaseCommand } from '@cli/BaseCommand';
export type { CommandOptions } from '@cli/BaseCommand';
export { CLI } from '@cli/CLI';
export { ErrorHandler, EXIT_CODES } from '@cli/ErrorHandler';

// Runtime detection and kernel
export { getKernel } from '@runtime/getKernel';
export { useFileLoader } from '@runtime/useFileLoader';

// Plugin system
export { PluginManager } from '@runtime/PluginManager';
export { PluginRegistry } from '@runtime/PluginRegistry';

export { nowIso } from '@common/utility';
export type { SanitizerError } from '@exceptions/ZintrustError';
export { randomBytes } from '@node-singletons/crypto';

/**
 * Framework version and build metadata
 * Available at runtime for debugging and health checks
 */
export const ZINTRUST_VERSION = '0.1.23';
export const ZINTRUST_BUILD_DATE = '__BUILD_DATE__'; // Replaced during build

//New Start Confing

export type { MiddlewaresType } from '@config/middleware';

export type * from '@config/type';

// Workers config
export type {
  RedisConfig,
  WorkerAutoScalingConfig,
  WorkerComplianceConfig,
  WorkerConfig,
  WorkerCostConfig,
  WorkerObservabilityConfig,
  WorkersConfigOverrides,
  WorkersGlobalConfig,
  WorkerStatus,
  WorkerVersioningConfig,
} from '@config/type';
export { createRedisConnection, workersConfig } from '@config/workers';

// NOTE: Node-only exports (like FileLogWriter, process) are intentionally not
// exported from this root entrypoint. Use the '@zintrust/core/node' subpath.
