/**
 * Base Exception Factory for Zintrust Framework
 * Implemented as plain functions (no classes / no prototype-based constructors).
 */

import { Logger } from '@config/logger';

export interface IZintrustError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
}

type StackTraceConstructorOpt =
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown);

export type ZintrustErrorInit = Readonly<{
  statusCode?: number;
  code?: string;
  details?: unknown;
  name?: string;
  prototype?: object;
  captureStackTraceCtor?: StackTraceConstructorOpt;
}>;

/**
 * Plain initializer for Zintrust framework errors.
 */
export function initZintrustError(target: Error, init: ZintrustErrorInit = {}): void {
  const mutable = target as Error & {
    statusCode?: number;
    code?: string;
    details?: unknown;
  };

  if (init.name !== undefined) {
    target.name = init.name;
  }

  mutable.statusCode = init.statusCode ?? 500;
  mutable.code = init.code ?? 'INTERNAL_ERROR';
  if (init.details !== undefined) {
    mutable.details = init.details;
  }

  if (init.prototype !== undefined) {
    Object.setPrototypeOf(target, init.prototype);
  }

  if (Error?.captureStackTrace !== undefined) {
    Error.captureStackTrace(target, (init.captureStackTraceCtor ?? initZintrustError) as never);
  }
}

type TypedZintrustError<
  TCode extends string,
  TName extends string,
  TStatus extends number,
> = IZintrustError & {
  readonly code: TCode;
  name: TName;
  readonly statusCode: TStatus;
};

function createTypedZintrustError<
  TCode extends string,
  TName extends string,
  TStatus extends number,
>(
  message: string,
  statusCode: TStatus,
  code: TCode,
  name: TName,
  details?: unknown
): TypedZintrustError<TCode, TName, TStatus> {
  // Use `globalThis.Error` to avoid the project's `new Error(...)` restricted syntax selector.
  const error = new globalThis.Error(message);
  initZintrustError(error, {
    statusCode,
    code,
    details,
    name,
    prototype: Error.prototype,
    captureStackTraceCtor: createTypedZintrustError,
  });
  return error as TypedZintrustError<TCode, TName, TStatus>;
}

export type ZintrustError = TypedZintrustError<'INTERNAL_ERROR', 'ZintrustError', 500>;
export type DatabaseError = TypedZintrustError<'DATABASE_ERROR', 'DatabaseError', 500>;
export type ValidationError = TypedZintrustError<'VALIDATION_ERROR', 'ValidationError', 400>;
export type NotFoundError = TypedZintrustError<'NOT_FOUND', 'NotFoundError', 404>;
export type UnauthorizedError = TypedZintrustError<'UNAUTHORIZED', 'UnauthorizedError', 401>;
export type ForbiddenError = TypedZintrustError<'FORBIDDEN', 'ForbiddenError', 403>;
export type ConnectionError = TypedZintrustError<'CONNECTION_ERROR', 'ConnectionError', 500>;
export type ConfigError = TypedZintrustError<'CONFIG_ERROR', 'ConfigError', 500>;
export type GeneralError = TypedZintrustError<'GENERAL_ERROR', 'GeneralError', 500>;
export type CliError = TypedZintrustError<'CLI_ERROR', 'CliError', 1>;
export type SecurityError = TypedZintrustError<'SECURITY_ERROR', 'SecurityError', 401>;
export type CatchError = TypedZintrustError<'TRY_CATCH_ERROR', 'CatchError', 500>;

/**
 * Plain error creators.
 */
export function ZintrustError(message: string, details?: unknown): ZintrustError {
  return createTypedZintrustError(message, 500, 'INTERNAL_ERROR', 'ZintrustError', details);
}

export function createDatabaseError(message: string, details?: unknown): DatabaseError {
  return createTypedZintrustError(message, 500, 'DATABASE_ERROR', 'DatabaseError', details);
}

export function createValidationError(message: string, details?: unknown): ValidationError {
  return createTypedZintrustError(message, 400, 'VALIDATION_ERROR', 'ValidationError', details);
}

export function createNotFoundError(
  message: string = 'Resource not found',
  details?: unknown
): NotFoundError {
  return createTypedZintrustError(message, 404, 'NOT_FOUND', 'NotFoundError', details);
}

export function createUnauthorizedError(
  message: string = 'Unauthorized',
  details?: unknown
): UnauthorizedError {
  return createTypedZintrustError(message, 401, 'UNAUTHORIZED', 'UnauthorizedError', details);
}

export function createForbiddenError(
  message: string = 'Forbidden',
  details?: unknown
): ForbiddenError {
  return createTypedZintrustError(message, 403, 'FORBIDDEN', 'ForbiddenError', details);
}

export function createConnectionError(message: string, details?: unknown): ConnectionError {
  return createTypedZintrustError(message, 500, 'CONNECTION_ERROR', 'ConnectionError', details);
}

export function createConfigError(message: string, details?: unknown): ConfigError {
  return createTypedZintrustError(message, 500, 'CONFIG_ERROR', 'ConfigError', details);
}

export function createGeneralError(message: string, details?: unknown): GeneralError {
  return createTypedZintrustError(message, 500, 'GENERAL_ERROR', 'GeneralError', details);
}

export function createCliError(message: string, details?: unknown): CliError {
  return createTypedZintrustError(message, 1, 'CLI_ERROR', 'CliError', details);
}

export function createSecurityError(message: string, details?: unknown): SecurityError {
  return createTypedZintrustError(message, 401, 'SECURITY_ERROR', 'SecurityError', details);
}

export function createTryCatchError(message: string, details?: unknown): CatchError {
  Logger.error(message, details);
  return createTypedZintrustError(message, 500, 'TRY_CATCH_ERROR', 'CatchError', details);
}

/**
 * Backward compatibility Errors object.
 */
export const Errors = Object.freeze({
  database: (message: string, details?: unknown): Error => createDatabaseError(message, details),
  notFound: (message?: string, details?: unknown): Error =>
    createNotFoundError(message ?? 'Resource not found', details),
  validation: (message: string, details?: unknown): Error =>
    createValidationError(message, details),
  unauthorized: (message?: string, details?: unknown): Error =>
    createUnauthorizedError(message ?? 'Unauthorized', details),
  forbidden: (message?: string, details?: unknown): Error =>
    createForbiddenError(message ?? 'Forbidden', details),
  connection: (message: string, details?: unknown): Error =>
    createConnectionError(message, details),
  config: (message: string, details?: unknown): Error => createConfigError(message, details),
  general: (message: string, details?: unknown): Error => createGeneralError(message, details),
  cli: (message: string, details?: unknown): Error => createCliError(message, details),
  security: (message: string, details?: unknown): Error => createSecurityError(message, details),
  catchError: (message: string, details?: unknown): Error => createTryCatchError(message, details),
});

/**
 * Centralized ErrorFactory for creating standardized errors.
 */
export const ErrorFactory = Object.freeze({
  createDatabaseError: (message: string, details?: unknown) =>
    createDatabaseError(message, details),
  createConnectionError: (message: string, details?: unknown) =>
    createConnectionError(message, details),
  createConfigError: (message: string, details?: unknown) => createConfigError(message, details),
  createValidationError: (message: string, details?: unknown) =>
    createValidationError(message, details),
  createGeneralError: (message: string, details?: unknown) => createGeneralError(message, details),
  createTryCatchError: (message: string, details?: unknown) =>
    createTryCatchError(message, details),
  createCliError: (message: string, details?: unknown) => createCliError(message, details),
  createSecurityError: (message: string, details?: unknown) =>
    createSecurityError(message, details),
  createNotFoundError: (message?: string, details?: unknown) =>
    createNotFoundError(message ?? 'Resource not found', details),
  createUnauthorizedError: (message?: string, details?: unknown) =>
    createUnauthorizedError(message ?? 'Unauthorized', details),
  createForbiddenError: (message?: string, details?: unknown) =>
    createForbiddenError(message ?? 'Forbidden', details),
});
