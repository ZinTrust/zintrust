import {
  ZintrustError,
  createDatabaseError,
  createForbiddenError,
  createNotFoundError,
  createUnauthorizedError,
  createValidationError,
} from '@/exceptions/ZintrustError';
import { describe, expect, it } from 'vitest';

describe('Exceptions', () => {
  it('should create base error', () => {
    const error = ZintrustError('Something went wrong');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('should create database error', () => {
    const error = createDatabaseError('Connection failed');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Connection failed');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('DATABASE_ERROR');
    expect(error.name).toBe('DatabaseError');
  });

  it('should create not found error', () => {
    const error = createNotFoundError();
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Resource not found');
  });

  it('should create validation error', () => {
    const error = createValidationError('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should create unauthorized error', () => {
    const error = createUnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should create forbidden error', () => {
    const error = createForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });
});
