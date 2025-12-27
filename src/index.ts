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
export { MiddlewareStack } from '@middleware/MiddlewareStack';
export type { Middleware } from '@middleware/MiddlewareStack';
export { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
export { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
export { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
export { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
export { Database, resetDatabase, useDatabase } from '@orm/Database';
export { Model } from '@orm/Model';
export type { IModel, ModelConfig, ModelStatic } from '@orm/Model';
export { QueryBuilder } from '@orm/QueryBuilder';
export type { IRelationship } from '@orm/Relationships';
export { Router } from '@routing/Router';
export type { IRouter } from '@routing/Router';

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

// Security
export { CsrfTokenManager } from '@security/CsrfTokenManager';
export type { CsrfTokenData } from '@security/CsrfTokenManager';
export { Encryptor } from '@security/Encryptor';
export { Hash } from '@security/Hash';
export { JwtManager } from '@security/JwtManager';
export type { JwtOptions, JwtPayload } from '@security/JwtManager';
export { Xss } from '@security/Xss';
export { XssProtection } from '@security/XssProtection';

// Exceptions
export { ErrorFactory } from '@exceptions/ZintrustError';

// Config
export { StartupConfigValidator } from '@config/StartupConfigValidator';
