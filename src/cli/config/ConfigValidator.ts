/**
 * Configuration Validator
 * Validates configuration against schema and rules
 */

import {
  CONFIG_RULES,
  getConfigValue,
  ProjectConfig,
  ValidationRule,
} from '@cli/config/ConfigSchema';

export interface ValidationError {
  key: string;
  value: unknown;
  message: string;
  rule: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate entire config against schema
 */
export function validateConfig(config: ProjectConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate each rule
  for (const key of Object.keys(CONFIG_RULES)) {
    const value = getConfigValue(config as Record<string, unknown>, key);
    const error = validateConfigValue(key, value);
    if (error !== null) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single config value
 */
export function validateConfigValue(key: string, value: unknown): ValidationError | null {
  const rule = (CONFIG_RULES as Record<string, ValidationRule>)[key];

  if (rule === undefined) {
    return null; // No rule, allow any value
  }

  // Check required
  const requiredError = checkRequired(key, value, rule);
  if (requiredError !== null) return requiredError;

  // Skip validation if not required and value is undefined
  if (rule.required !== true && value === undefined) {
    return null;
  }

  // Check type
  const typeError = checkType(key, value, rule);
  if (typeError !== null) return typeError;

  // Check enum
  const enumError = checkEnum(key, value, rule);
  if (enumError !== null) return enumError;

  // Check pattern
  const patternError = checkPattern(key, value, rule);
  if (patternError !== null) return patternError;

  // Check string length
  const stringLengthError = checkStringLength(key, value, rule);
  if (stringLengthError !== null) return stringLengthError;

  // Check number range
  const numberRangeError = checkNumberRange(key, value, rule);
  if (numberRangeError !== null) return numberRangeError;

  return null;
}

/**
 * Check if value is required
 */
function checkRequired(key: string, value: unknown, rule: ValidationRule): ValidationError | null {
  if (rule.required === true && (value === undefined || value === null)) {
    return {
      key,
      value,
      message: `${key} is required`,
      rule: 'required',
    };
  }
  return null;
}

/**
 * Check type compatibility
 */
function checkType(key: string, value: unknown, rule: ValidationRule): ValidationError | null {
  if (rule.type !== undefined && typeof value !== rule.type) {
    return {
      key,
      value,
      message: `${key} must be of type ${rule.type}, got ${typeof value}`,
      rule: 'type',
    };
  }
  return null;
}

/**
 * Check enum values
 */
function checkEnum(key: string, value: unknown, rule: ValidationRule): ValidationError | null {
  if (rule.enum !== undefined) {
    if (!rule.enum.includes(value as string)) {
      return {
        key,
        value,
        message: `${key} must be one of: ${rule.enum.join(', ')}`,
        rule: 'enum',
      };
    }
  }
  return null;
}

/**
 * Check string pattern
 */
function checkPattern(key: string, value: unknown, rule: ValidationRule): ValidationError | null {
  if (rule.pattern !== undefined && typeof value === 'string') {
    if (!rule.pattern.test(value)) {
      return {
        key,
        value,
        message: `${key} must match pattern: ${rule.pattern}`,
        rule: 'pattern',
      };
    }
  }
  return null;
}

/**
 * Check string length constraints
 */
function checkStringLength(
  key: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (rule.minLength !== undefined && value.length < rule.minLength) {
    return {
      key,
      value,
      message: `${key} must be at least ${rule.minLength} characters`,
      rule: 'minLength',
    };
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    return {
      key,
      value,
      message: `${key} must be at most ${rule.maxLength} characters`,
      rule: 'maxLength',
    };
  }

  return null;
}

/**
 * Check number range constraints
 */
function checkNumberRange(
  key: string,
  value: unknown,
  rule: ValidationRule
): ValidationError | null {
  if (typeof value !== 'number') {
    return null;
  }

  if (rule.min !== undefined && value < rule.min) {
    return {
      key,
      value,
      message: `${key} must be at least ${rule.min}`,
      rule: 'min',
    };
  }

  if (rule.max !== undefined && value > rule.max) {
    return {
      key,
      value,
      message: `${key} must be at most ${rule.max}`,
      rule: 'max',
    };
  }

  return null;
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'Configuration is valid';
  }

  const lines = ['Configuration validation failed:'];
  for (const error of result.errors) {
    lines.push(`  ❌ ${error.key}: ${error.message}`);
  }
  return lines.join('\n');
}

/**
 * Get validation rule description
 */
export function getConfigDescription(key: string): string | undefined {
  const rule = (CONFIG_RULES as Record<string, ValidationRule>)[key];
  return rule?.description;
}

/**
 * ConfigValidator namespace - sealed for immutability
 */
export const ConfigValidator = Object.freeze({
  validate: validateConfig,
  validateValue: validateConfigValue,
  formatErrors: formatValidationErrors,
  getDescription: getConfigDescription,
});
