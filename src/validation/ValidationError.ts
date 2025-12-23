/**
 * Validation Error
 * Structured error response for validation failures with field-level details
 */

export interface FieldError {
  field: string;
  message: string;
  rule: string;
}

export interface IValidationError extends Error {
  errors: FieldError[];
  toObject(): Record<string, string[]>;
  getFieldError(field: string): string | undefined;
  hasFieldError(field: string): boolean;
}

/**
 * Convert errors array to field:errors object
 */
export const toObject = (errors: FieldError[]): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  for (const error of errors) {
    result[error.field] ??= [];
    result[error.field].push(error.message);
  }
  return result;
};

/**
 * Get first error message for a field
 */
export const getFieldError = (errors: FieldError[], field: string): string | undefined => {
  return errors.find((e) => e.field === field)?.message;
};

/**
 * Check if field has errors
 */
export const hasFieldError = (errors: FieldError[], field: string): boolean => {
  return errors.some((e) => e.field === field);
};

/**
 * Create a validation error instance
 */
const createValidationError = (
  errors: FieldError[],
  message: string = 'Validation failed'
): IValidationError => {
  const error = new Error(message) as unknown as IValidationError;
  error.name = 'ValidationError';
  error.errors = errors;
  error.toObject = () => toObject(errors);
  error.getFieldError = (field: string) => getFieldError(errors, field);
  error.hasFieldError = (field: string) => hasFieldError(errors, field);
  return error;
};

/**
 * ValidationError namespace - sealed for immutability
 */
export const ValidationError = Object.freeze({
  create: createValidationError,
  toObject,
  getFieldError,
  hasFieldError,
});

// For backward compatibility with existing imports
export { createValidationError };
