/**
 * Validator
 * Schema-based input validation with fluent API matching QueryBuilder style
 */

import { FieldError, ValidationError } from '@validation/ValidationError';

export type Rule =
  | 'required'
  | 'email'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'integer'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'regex'
  | 'in'
  | 'custom';

export interface ValidationRule {
  rule: Rule;
  value?: unknown;
  message?: string;
}

/**
 * Schema builder for defining validation rules
 */
export class Schema {
  private readonly rules: Map<string, ValidationRule[]> = new Map();

  /**
   * Define a required field
   */
  public required(field: string, message?: string): this {
    this.addRule(field, { rule: 'required', message });
    return this;
  }

  /**
   * Define a string field with optional length constraints
   */
  public string(field: string, message?: string): this {
    this.addRule(field, { rule: 'string', message });
    return this;
  }

  /**
   * Define a number field
   */
  public number(field: string, message?: string): this {
    this.addRule(field, { rule: 'number', message });
    return this;
  }

  /**
   * Define an integer field
   */
  public integer(field: string, message?: string): this {
    this.addRule(field, { rule: 'integer', message });
    return this;
  }

  /**
   * Define a boolean field
   */
  public boolean(field: string, message?: string): this {
    this.addRule(field, { rule: 'boolean', message });
    return this;
  }

  /**
   * Define an array field
   */
  public array(field: string, message?: string): this {
    this.addRule(field, { rule: 'array', message });
    return this;
  }

  /**
   * Define email validation
   */
  public email(field: string, message?: string): this {
    this.addRule(field, { rule: 'email', message });
    return this;
  }

  /**
   * Validate minimum value for numbers
   */
  public min(field: string, value: number, message?: string): this {
    this.addRule(field, { rule: 'min', value, message });
    return this;
  }

  /**
   * Validate maximum value for numbers
   */
  public max(field: string, value: number, message?: string): this {
    this.addRule(field, { rule: 'max', value, message });
    return this;
  }

  /**
   * Validate minimum string/array length
   */
  public minLength(field: string, value: number, message?: string): this {
    this.addRule(field, { rule: 'minLength', value, message });
    return this;
  }

  /**
   * Validate maximum string/array length
   */
  public maxLength(field: string, value: number, message?: string): this {
    this.addRule(field, { rule: 'maxLength', value, message });
    return this;
  }

  /**
   * Validate against regex pattern
   */
  public regex(field: string, pattern: RegExp, message?: string): this {
    this.addRule(field, { rule: 'regex', value: pattern, message });
    return this;
  }

  /**
   * Validate value is in list
   */
  public in(field: string, values: unknown[], message?: string): this {
    this.addRule(field, { rule: 'in', value: values, message });
    return this;
  }

  /**
   * Custom validation function
   */
  public custom(field: string, validator: (value: unknown) => boolean, message?: string): this {
    this.addRule(field, { rule: 'custom', value: validator, message });
    return this;
  }

  /**
   * Get all rules
   */
  public getRules(): Map<string, ValidationRule[]> {
    return this.rules;
  }

  private addRule(field: string, rule: ValidationRule): void {
    if (!this.rules.has(field)) {
      this.rules.set(field, []);
    }
    this.rules.get(field)?.push(rule);
  }
}

/**
 * Validate data against schema
 */
export function validate(data: Record<string, unknown>, schema: Schema): Record<string, unknown> {
  const errors: FieldError[] = [];
  const rules = schema.getRules();

  for (const [field, fieldRules] of rules.entries()) {
    const value = data[field];

    for (const rule of fieldRules) {
      const error = validateRule(field, value, rule);
      if (error !== null) {
        errors.push(error);
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return data;
}

/**
 * Check if data is valid without throwing
 */
export function isValid(data: Record<string, unknown>, schema: Schema): boolean {
  try {
    validate(data, schema);
    return true;
  } catch {
    return false;
  }
}

function validateRule(field: string, value: unknown, rule: ValidationRule): FieldError | null {
  const message = (rule?.message ?? '') || getDefaultMessage(field, rule.rule);

  const validators: Record<Rule, () => FieldError | null> = {
    required: () => validateRequired(field, value, message),
    string: () => validateString(field, value, message),
    number: () => validateNumber(field, value, message),
    integer: () => validateInteger(field, value, message),
    boolean: () => validateBoolean(field, value, message),
    array: () => validateArray(field, value, message),
    email: () => validateEmail(field, value, message),
    min: () => validateMin(field, value, rule.value as number, message),
    max: () => validateMax(field, value, rule.value as number, message),
    minLength: () => validateMinLength(field, value, rule.value as number, message),
    maxLength: () => validateMaxLength(field, value, rule.value as number, message),
    regex: () => validateRegex(field, value, rule.value as RegExp, message),
    in: () => validateIn(field, value, rule.value as unknown[], message),
    custom: () => validateCustom(field, value, rule.value as (v: unknown) => boolean, message),
  };

  return validators[rule.rule]?.() ?? null;
}

function validateRequired(field: string, value: unknown, message: string): FieldError | null {
  return value === null || value === undefined || value === ''
    ? { field, message, rule: 'required' }
    : null;
}

function validateString(field: string, value: unknown, message: string): FieldError | null {
  return typeof value === 'string' ? null : { field, message, rule: 'string' };
}

function validateNumber(field: string, value: unknown, message: string): FieldError | null {
  return typeof value !== 'number' || Number.isNaN(value)
    ? { field, message, rule: 'number' }
    : null;
}

function validateInteger(field: string, value: unknown, message: string): FieldError | null {
  return Number.isInteger(value) ? null : { field, message, rule: 'integer' };
}

function validateBoolean(field: string, value: unknown, message: string): FieldError | null {
  return typeof value === 'boolean' ? null : { field, message, rule: 'boolean' };
}

function validateArray(field: string, value: unknown, message: string): FieldError | null {
  return Array.isArray(value) ? null : { field, message, rule: 'array' };
}

function validateEmail(field: string, value: unknown, message: string): FieldError | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof value !== 'string' || !emailRegex.test(value)
    ? { field, message, rule: 'email' }
    : null;
}

function validateMin(
  field: string,
  value: unknown,
  minValue: number,
  message: string
): FieldError | null {
  return typeof value === 'number' && value < minValue ? { field, message, rule: 'min' } : null;
}

function validateMax(
  field: string,
  value: unknown,
  maxValue: number,
  message: string
): FieldError | null {
  return typeof value === 'number' && value > maxValue ? { field, message, rule: 'max' } : null;
}

function validateMinLength(
  field: string,
  value: unknown,
  minLen: number,
  message: string
): FieldError | null {
  return (typeof value === 'string' || Array.isArray(value)) && value.length < minLen
    ? { field, message, rule: 'minLength' }
    : null;
}

function validateMaxLength(
  field: string,
  value: unknown,
  maxLen: number,
  message: string
): FieldError | null {
  return (typeof value === 'string' || Array.isArray(value)) && value.length > maxLen
    ? { field, message, rule: 'maxLength' }
    : null;
}

function validateRegex(
  field: string,
  value: unknown,
  pattern: RegExp,
  message: string
): FieldError | null {
  return typeof value !== 'string' || !pattern.test(value)
    ? { field, message, rule: 'regex' }
    : null;
}

function validateIn(
  field: string,
  value: unknown,
  values: unknown[],
  message: string
): FieldError | null {
  return values.includes(value) ? null : { field, message, rule: 'in' };
}

function validateCustom(
  field: string,
  value: unknown,
  validator: (v: unknown) => boolean,
  message: string
): FieldError | null {
  return validator(value) ? null : { field, message, rule: 'custom' };
}

function getDefaultMessage(field: string, rule: Rule): string {
  const messages: Record<Rule, string> = {
    required: `${field} is required`,
    email: `${field} must be a valid email`,
    string: `${field} must be a string`,
    number: `${field} must be a number`,
    boolean: `${field} must be a boolean`,
    array: `${field} must be an array`,
    integer: `${field} must be an integer`,
    min: `${field} is too small`,
    max: `${field} is too large`,
    minLength: `${field} is too short`,
    maxLength: `${field} is too long`,
    regex: `${field} format is invalid`,
    in: `${field} value is not allowed`,
    custom: `${field} validation failed`,
  };
  return messages[rule];
}

/**
 * Validator validates data against a schema
 */
export const Validator = {
  validate,
  isValid,
};

/**
 * Export ValidationError for use in tests and applications
 */
export { ValidationError } from '@validation/ValidationError';
export type { FieldError } from '@validation/ValidationError';
