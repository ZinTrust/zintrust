/**
 * ZinTrust Framework - Runtime-only entrypoint for production Workers
 * Excludes CLI utilities, seeders, test helpers, scripts, tools, proxy, and templates
 * Only includes core runtime primitives needed for request handling and boot-time setup
 */

/**
 * Framework version and build metadata
 * Available at runtime for debugging and health checks
 */
export const ZINTRUST_VERSION = '0.1.41';
export const ZINTRUST_BUILD_DATE = '__BUILD_DATE__'; // Replaced during build

// Core application and server primitives
export { Application } from '@boot/Application';
export { Server } from '@boot/Server';
export { AwsSigV4 } from '@common/index';
export { ServiceContainer } from '@container/ServiceContainer';
export { SignedRequest } from '@security/SignedRequest';

// HTTP primitives for request handling
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

// Core middleware for request processing
export { BulletproofAuthMiddleware } from '@middleware/BulletproofAuthMiddleware';
export { CsrfMiddleware } from '@middleware/CsrfMiddleware';
export { ErrorHandlerMiddleware } from '@middleware/ErrorHandlerMiddleware';
export { LoggingMiddleware } from '@middleware/LoggingMiddleware';
export { MiddlewareStack } from '@middleware/MiddlewareStack';
export type { Middleware } from '@middleware/MiddlewareStack';
export { RateLimiter } from '@middleware/RateLimiter';
export { SecurityMiddleware } from '@middleware/SecurityMiddleware';
export { SessionMiddleware } from '@middleware/SessionMiddleware';
export { ValidationMiddleware } from '@middleware/ValidationMiddleware';

// Minimal ORM primitives for request handlers
export { createPaginator, getNextPageUrl, getPrevPageUrl, Paginator } from '@database/Paginator';
export type {
  CreatePaginatorInput,
  PaginationLinks,
  PaginationQuery,
  Paginator as PaginatorType,
} from '@database/Paginator';
export {
  Database,
  DatabaseConnectionRegistry,
  Model,
  QueryBuilder,
  resetDatabase,
  useDatabase,
  useEnsureDbConnected,
} from '@zintrust/core/orm';
export type {
  IDatabase,
  IModel,
  InsertResult,
  IQueryBuilder,
  IRelationship,
  ModelConfig,
  ModelStatic,
  PaginationOptions,
} from '@zintrust/core/orm';

// Time Utilities
export { DateTime } from '@time/DateTime';
export type { IDateTime } from '@time/DateTime';

// Validation primitives
export { ValidationError } from '@validation/ValidationError';
export type { FieldError } from '@validation/ValidationError';
export { Schema, Validator } from '@validation/Validator';
export type { ISchema, SchemaType } from '@validation/Validator';

// Security primitives moved to @zintrust/core/security subpath

// Exceptions
export { ErrorFactory } from '@exceptions/ZintrustError';

// Runtime services and detection
export { detectRuntime } from '@runtime/detectRuntime';
export { getKernel } from '@runtime/getKernel';
export { PluginManager } from '@runtime/PluginManager';
export { PluginRegistry } from '@runtime/PluginRegistry';
export {
  detectCloudflareWorkers,
  detectRuntimePlatform,
  RUNTIME_PLATFORM,
  RuntimeServices,
  type RuntimeCrypto,
  type RuntimeEnvReader,
  type RuntimeFs,
  type RuntimePlatform,
  type RuntimeServices as RuntimeServicesType,
  type RuntimeTimers,
} from '@runtime/RuntimeServices';
export { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';
export { useFileLoader } from '@runtime/useFileLoader';

// Events
export { SystemTraceBridge } from '@/trace/SystemTraceBridge';
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

// Core config primitives
export { Env } from '@config/env';
export { Logger } from '@config/logger';
export type { LogSink } from '@config/logger';

// Core runtime config
export { appConfig } from '@config/app';
export type { AppConfig } from '@config/app';
export { cacheConfig } from '@config/cache';
export type { CacheConfig, CacheConfigOverrides } from '@config/cache';
export { databaseConfig } from '@config/database';
export type {
  DatabaseConfigOverrides,
  DatabaseConfig as DatabaseRuntimeConfig,
} from '@config/database';
export { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';

// Cache primitives
export { Cache, cache } from '@cache/Cache';
export type { CacheDriver } from '@cache/CacheDriver';
export { CacheDriverRegistry } from '@cache/CacheDriverRegistry';
export { registerCachesFromRuntimeConfig } from '@cache/CacheRuntimeRegistration';

// Queue primitives
export { createBaseDrivers, queueConfig } from '@config/queue';
export type { QueueConfig, QueueConfigOverrides } from '@config/queue';
export { resolveDeduplicationLockKey } from '@queue/DeduplicationKey';
export { Queue, resolveLockPrefix } from '@queue/Queue';
export type { BullMQPayload, IQueueDriver, QueueMessage } from '@queue/Queue';
export { registerQueuesFromRuntimeConfig } from '@tools/queue/QueueRuntimeRegistration';

// Router primitives
export { Router } from '@core-routes/Router';
export type { IRouter, RouteOptions } from '@core-routes/Router';
export { normalizeRouteMeta, RouteRegistry } from '@core-routes/RouteRegistry';
export type { RouteMeta, RouteMetaInput, RouteRegistration } from '@core-routes/RouteRegistry';

// Common utilities
export {
  generateSecureJobId,
  generateUuid,
  getString,
  Utilities,
  type UtilitiesType,
} from '@/common/utility';
export { ContextLoader } from '@common/ContextLoader';
export type {
  ContextLoaderBatchHandler,
  ContextLoaderBatchKey,
  ContextLoaderBatchResult,
  ContextLoaderContext,
  ContextLoaderInstance,
  ContextLoaderMode,
  ContextLoaderPlan,
  ContextLoaderResolver,
} from '@common/ContextLoader';
export { delay, ensureDirSafe } from '@common/index';
export { RemoteSignedJson } from '@common/RemoteSignedJson';
export type { RemoteSignedJsonSettings } from '@common/RemoteSignedJson';

// Collections
export { collect, Collection } from '@/collections/index';
export type { ICollection, PrimitiveKey } from '@/collections/index';

// Helper functions
export * from '@helper/index';

// Node Singletons (cross-runtime wrappers for Node.js APIs)
export * as NodeSingletons from '@node-singletons/index';

// Auth features moved to @zintrust/core/auth subpath

// MicroserviceManager moved to @zintrust/core/microservices
export type { ProjectRuntimeModule, ServiceManifestEntry } from '@microservices/ServiceManifest';
export { ProjectRuntime } from '@runtime/ProjectRuntime';

// Utility functions
export { nowIso } from '@common/utility';
export type { SanitizerError } from '@exceptions/ZintrustError';
export { randomBytes } from '@node-singletons/crypto';

// Redis key manager moved to @zintrust/core/redis subpath

// NOTE: Node-only exports (like FileLogWriter, process) are intentionally not
// exported from this root entrypoint. Use the '@zintrust/core/node' subpath.

// Socket/WebSocket primitives
export { CloudflareSocket } from '@sockets/CloudflareSocket';
export { SocketFeature } from '@sockets/SocketRuntime';
export type {
  SocketAuthorizationContext,
  SocketAuthorizationDecision,
  SocketAuthorizer,
  SocketAuthorizerHandler,
  SocketFeatureSettings,
  SocketNodeUpgradeInput,
  SocketPublishContext,
  SocketPublishDecision,
  SocketPublishPolicy,
  SocketPublishPolicyHandler,
  SocketRouteRegistrar,
  SocketRuntime,
  SocketRuntimeDiagnostics,
  SocketTransportMode,
  SocketWorkerContext,
} from '@sockets/SocketRuntime';
export { SocketRuntimeRegistry } from '@sockets/SocketRuntimeRegistry';
