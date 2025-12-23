/**
 * Base Exception Factory for Zintrust Framework
 * Prevents S112 (Generic exceptions should not be thrown)
 * Implemented without 'class' keyword to satisfy framework constraints
 */

export interface IZintrustError extends Error {
  statusCode: number;
  code: string;
}

export interface ZintrustErrorConstructor {
  new (message: string, statusCode?: number, code?: string): IZintrustError;
  (message: string, statusCode?: number, code?: string): IZintrustError;
  prototype: IZintrustError;
}

export interface DatabaseErrorConstructor {
  new (message: string): IZintrustError;
  (message: string): IZintrustError;
  prototype: IZintrustError;
}

export interface ValidationErrorConstructor {
  new (message: string): IZintrustError;
  (message: string): IZintrustError;
  prototype: IZintrustError;
}

export interface NotFoundErrorConstructor {
  new (message?: string): IZintrustError;
  (message?: string): IZintrustError;
  prototype: IZintrustError;
}

export interface UnauthorizedErrorConstructor {
  new (message?: string): IZintrustError;
  (message?: string): IZintrustError;
  prototype: IZintrustError;
}

export interface ForbiddenErrorConstructor {
  new (message?: string): IZintrustError;
  (message?: string): IZintrustError;
  prototype: IZintrustError;
}

/**
 * Base Zintrust Error
 */
export const ZintrustError = function (
  this: IZintrustError | undefined,
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR'
): IZintrustError {
  const instance = new Error(message) as unknown as IZintrustError;
  Object.setPrototypeOf(instance, ZintrustError.prototype);

  instance.name = 'ZintrustError';
  instance.statusCode = statusCode;
  instance.code = code;

  return instance;
} as unknown as ZintrustErrorConstructor;

ZintrustError.prototype = Object.create(Error.prototype);
ZintrustError.prototype.constructor = ZintrustError;

/**
 * Database Error
 */
export const DatabaseError = function (
  this: IZintrustError | undefined,
  message: string
): IZintrustError {
  const instance = ZintrustError.call(this, message, 500, 'DATABASE_ERROR');
  Object.setPrototypeOf(instance, DatabaseError.prototype);
  instance.name = 'DatabaseError';
  return instance;
} as unknown as DatabaseErrorConstructor;
DatabaseError.prototype = Object.create(ZintrustError.prototype);
DatabaseError.prototype.constructor = DatabaseError;

/**
 * Validation Error
 */
export const ValidationError = function (
  this: IZintrustError | undefined,
  message: string
): IZintrustError {
  const instance = ZintrustError.call(this, message, 400, 'VALIDATION_ERROR');
  Object.setPrototypeOf(instance, ValidationError.prototype);
  instance.name = 'ValidationError';
  return instance;
} as unknown as ValidationErrorConstructor;
ValidationError.prototype = Object.create(ZintrustError.prototype);
ValidationError.prototype.constructor = ValidationError;

/**
 * Not Found Error
 */
export const NotFoundError = function (
  this: IZintrustError | undefined,
  message: string = 'Resource not found'
): IZintrustError {
  const instance = ZintrustError.call(this, message, 404, 'NOT_FOUND');
  Object.setPrototypeOf(instance, NotFoundError.prototype);
  instance.name = 'NotFoundError';
  return instance;
} as unknown as NotFoundErrorConstructor;
NotFoundError.prototype = Object.create(ZintrustError.prototype);
NotFoundError.prototype.constructor = NotFoundError;

/**
 * Unauthorized Error
 */
export const UnauthorizedError = function (
  this: IZintrustError | undefined,
  message: string = 'Unauthorized'
): IZintrustError {
  const instance = ZintrustError.call(this, message, 401, 'UNAUTHORIZED');
  Object.setPrototypeOf(instance, UnauthorizedError.prototype);
  instance.name = 'UnauthorizedError';
  return instance;
} as unknown as UnauthorizedErrorConstructor;
UnauthorizedError.prototype = Object.create(ZintrustError.prototype);
UnauthorizedError.prototype.constructor = UnauthorizedError;

/**
 * Forbidden Error
 */
export const ForbiddenError = function (
  this: IZintrustError | undefined,
  message: string = 'Forbidden'
): IZintrustError {
  const instance = ZintrustError.call(this, message, 403, 'FORBIDDEN');
  Object.setPrototypeOf(instance, ForbiddenError.prototype);
  instance.name = 'ForbiddenError';
  return instance;
} as unknown as ForbiddenErrorConstructor;
ForbiddenError.prototype = Object.create(ZintrustError.prototype);
ForbiddenError.prototype.constructor = ForbiddenError;

export const Errors = Object.freeze({
  database: (message: string): Error => new DatabaseError(message),
  notFound: (message: string = 'Resource not found'): Error => new NotFoundError(message),
  validation: (message: string): Error => new ValidationError(message),
  unauthorized: (message: string = 'Unauthorized'): Error => new UnauthorizedError(message),
  forbidden: (message: string = 'Forbidden'): Error => new ForbiddenError(message),
});
