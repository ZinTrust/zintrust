/**
 * Validation Error
 * Structured error response for validation failures with field-level details
 */

export interface FieldError {
  field: string;
  message: string;
  rule: string;
}

/**
 * ValidationError represents validation failure with detailed field errors
 */
export class ValidationError extends Error {
  public readonly errors: FieldError[];

  constructor(errors: FieldError[], message: string = 'Validation failed') {
    super(message);
    this.errors = errors;
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /**
   * Get errors as object keyed by field name
   */
  public toObject(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const error of this.errors) {
      const existing = result[error.field];
      if (existing === undefined) {
        result[error.field] = [];
      }
      result[error.field].push(error.message);
    }
    return result;
  }

  /**
   * Get first error message for a field
   */
  public getFieldError(field: string): string | undefined {
    return this.errors.find((e) => e.field === field)?.message;
  }

  /**
   * Check if field has errors
   */
  public hasFieldError(field: string): boolean {
    return this.errors.some((e) => e.field === field);
  }
}
