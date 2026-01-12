/**
 * Validation Helper
 * Utilities for working with validated request data
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';

type ValidatedShape = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
};

const getValidated = (req: IRequest): ValidatedShape | undefined => {
  return (req as unknown as { validated?: ValidatedShape }).validated;
};

/**
 * Extract validated body from request
 * Returns the validated body if present, undefined otherwise
 *
 * @example
 * ```typescript
 * const body = getValidatedBody(req);
 * if (!body) {
 *   Logger.error('Validation middleware not configured');
 *   return res.setStatus(500).json({ error: 'Internal server error' });
 * }
 * const email = getString(body['email']);
 * ```
 */
export function getValidatedBody<T = Record<string, unknown>>(req: IRequest): T | undefined {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.body === undefined) return undefined;
  return validated.body as T;
}

/**
 * Check if request has a validated body
 * Type guard for validated body existence
 *
 * @example
 * ```typescript
 * if (!hasValidatedBody(req)) {
 *   Logger.error('Validation middleware not configured');
 *   return res.setStatus(500).json({ error: 'Internal server error' });
 * }
 * const body = getValidatedBody(req)!; // Safe to use non-null assertion
 * ```
 */
export function hasValidatedBody(req: IRequest): boolean {
  const validated = getValidated(req);
  if (validated === undefined) return false;
  if (validated.body === undefined) return false;
  return true;
}

/**
 * Extract validated body or throw error
 * Throws if validation middleware is not properly configured
 *
 * @example
 * ```typescript
 * try {
 *   const body = requireValidatedBody(req);
 *   const email = getString(body['email']);
 * } catch (error) {
 *   Logger.error('Validation middleware error', error);
 *   return res.setStatus(500).json({ error: 'Internal server error' });
 * }
 * ```
 */
export function requireValidatedBody<T = Record<string, unknown>>(req: IRequest): T {
  const body = getValidatedBody<T>(req);
  if (body === undefined) {
    throw ErrorFactory.createValidationError(
      'Validation middleware did not populate req.validated.body'
    );
  }
  return body;
}

/**
 * Extract validated query parameters from request
 * Returns the validated query if present, undefined otherwise
 */
export function getValidatedQuery<T = Record<string, unknown>>(req: IRequest): T | undefined {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.query === undefined) return undefined;
  return validated.query as T;
}

/**
 * Extract validated route parameters from request
 * Returns the validated params if present, undefined otherwise
 */
export function getValidatedParams<T = Record<string, unknown>>(req: IRequest): T | undefined {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.params === undefined) return undefined;
  return validated.params as T;
}

/**
 * Extract validated headers from request
 * Returns the validated headers if present, undefined otherwise
 */
export function getValidatedHeaders<T = Record<string, unknown>>(req: IRequest): T | undefined {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.headers === undefined) return undefined;
  return validated.headers as T;
}

/**
 * Validation Helper - Sealed namespace
 */
export const ValidationHelper = Object.freeze({
  getValidatedBody,
  hasValidatedBody,
  requireValidatedBody,
  getValidatedQuery,
  getValidatedParams,
  getValidatedHeaders,
});

export default ValidationHelper;
