/**
 * Validator
 * Schema-based input validation with fluent API matching QueryBuilder style
 * Sealed namespace pattern - all exports through Validator namespace
 */

import { Logger } from '@config/logger';
import { FieldError, createValidationError } from '@validation/ValidationError';

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

export type CustomValidatorFn =
  | ((value: unknown) => boolean)
  | ((value: unknown, data: Record<string, unknown>) => boolean);

export interface ISchema {
  required(field: string, message?: string): ISchema;
  string(field: string, message?: string): ISchema;
  number(field: string, message?: string): ISchema;
  integer(field: string, message?: string): ISchema;
  boolean(field: string, message?: string): ISchema;
  array(field: string, message?: string): ISchema;
  email(field: string, message?: string): ISchema;
  min(field: string, value: number, message?: string): ISchema;
  max(field: string, value: number, message?: string): ISchema;
  minLength(field: string, value: number, message?: string): ISchema;
  maxLength(field: string, value: number, message?: string): ISchema;
  regex(field: string, pattern: RegExp, message?: string): ISchema;
  in(field: string, values: unknown[], message?: string): ISchema;
  custom(field: string, validator: CustomValidatorFn, message?: string): ISchema;
  getRules(): Map<string, ValidationRule[]>;
}

const addSimpleRule = (
  schema: ISchema,
  rules: Map<string, ValidationRule[]>,
  field: string,
  rule: Rule,
  message?: string
): ISchema => {
  if (!rules.has(field)) rules.set(field, []);
  rules.get(field)?.push({ rule, message });
  return schema;
};

const addComplexRule = (
  schema: ISchema,
  rules: Map<string, ValidationRule[]>,
  field: string,
  rule: Rule,
  value: unknown,
  message?: string
): ISchema => {
  if (!rules.has(field)) rules.set(field, []);
  rules.get(field)?.push({ rule, value, message });
  return schema;
};

export interface SchemaType {
  create(): ISchema;
}

/**
 * Schema builder for defining validation rules
 * Sealed namespace for immutability
 */
export const Schema = Object.freeze({
  /**
   * Create a new schema instance
   */
  create(): ISchema {
    const rules: Map<string, ValidationRule[]> = new Map();

    const schema: ISchema = {
      required: (f, m) => addSimpleRule(schema, rules, f, 'required', m),
      string: (f, m) => addSimpleRule(schema, rules, f, 'string', m),
      number: (f, m) => addSimpleRule(schema, rules, f, 'number', m),
      integer: (f, m) => addSimpleRule(schema, rules, f, 'integer', m),
      boolean: (f, m) => addSimpleRule(schema, rules, f, 'boolean', m),
      array: (f, m) => addSimpleRule(schema, rules, f, 'array', m),
      email: (f, m) => addSimpleRule(schema, rules, f, 'email', m),
      min: (f, v, m) => addComplexRule(schema, rules, f, 'min', v, m),
      max: (f, v, m) => addComplexRule(schema, rules, f, 'max', v, m),
      minLength: (f, v, m) => addComplexRule(schema, rules, f, 'minLength', v, m),
      maxLength: (f, v, m) => addComplexRule(schema, rules, f, 'maxLength', v, m),
      regex: (f, p, m) => addComplexRule(schema, rules, f, 'regex', p, m),
      in: (f, v, m) => addComplexRule(schema, rules, f, 'in', v, m),
      custom: (f, v, m) => addComplexRule(schema, rules, f, 'custom', v, m),
      getRules: () => rules,
    };

    return schema;
  },
});

/**
 * Validate data against schema
 */
const validate = (data: Record<string, unknown>, schema: ISchema): Record<string, unknown> => {
  const errors: FieldError[] = [];
  const rules = schema.getRules();

  for (const [field, fieldRules] of rules.entries()) {
    const value = data[field];

    for (const rule of fieldRules) {
      const error = validateRule(field, value, rule, data);
      if (error !== null) {
        errors.push(error);
      }
    }
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  return data;
};

/**
 * Check if data is valid without throwing
 */
const isValid = (data: Record<string, unknown>, schema: ISchema): boolean => {
  try {
    validate(data, schema);
    return true;
  } catch (error) {
    Logger.error('Validation failed', error);
    return false;
  }
};

function validateRule(
  field: string,
  value: unknown,
  rule: ValidationRule,
  data: Record<string, unknown> | undefined
): FieldError | null {
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
    custom: () => validateCustom(field, value, rule.value as CustomValidatorFn, message, data),
  };

  return validators[rule.rule]?.() ?? null;
}

type RuleStringInput = string | string[];
export type RuleStringMap = Record<string, RuleStringInput>;

const splitRuleTokens = (input: RuleStringInput): string[] => {
  if (Array.isArray(input)) return input.flatMap((v) => splitRuleTokens(v));
  const trimmed = input.trim();
  if (trimmed === '') return [];
  return trimmed
    .split('|')
    .map((t) => t.trim())
    .filter((t) => t !== '');
};

const parseRegexLiteral = (raw: string): RegExp | null => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.length < 2) return null;
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash <= 0) return null;

  const pattern = trimmed.slice(1, lastSlash);
  const flags = trimmed.slice(lastSlash + 1);

  if (pattern.length === 0) return null;
  if (pattern.length > 500) return null;
  if (flags.length > 10) return null;

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
};

const parseNumberArg = (arg: string | undefined): number | null => {
  if (arg === undefined) return null;
  const n = Number.parseFloat(arg);
  if (Number.isNaN(n)) return null;
  return n;
};

const parseInArgs = (arg: string | undefined): string[] => {
  return (arg ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
};

type RuleStringTokenContext = {
  schema: ISchema;
  field: string;
  tokenSet: Set<string>;
  name: string;
  arg: string | undefined;
};

const ruleStringTokenHandlers: Record<string, (ctx: RuleStringTokenContext) => void> = {
  required: ({ schema, field }) => {
    schema.required(field);
  },
  string: ({ schema, field }) => {
    schema.string(field);
  },
  number: ({ schema, field }) => {
    schema.number(field);
  },
  integer: ({ schema, field }) => {
    schema.integer(field);
  },
  boolean: ({ schema, field }) => {
    schema.boolean(field);
  },
  array: ({ schema, field }) => {
    schema.array(field);
  },
  email: ({ schema, field }) => {
    schema.email(field);
  },
  min: ({ schema, field, tokenSet, arg }) => {
    const n = parseNumberArg(arg);
    if (n === null) return;
    if (tokenSet.has('string') || tokenSet.has('array')) schema.minLength(field, n);
    else schema.min(field, n);
  },
  max: ({ schema, field, tokenSet, arg }) => {
    const n = parseNumberArg(arg);
    if (n === null) return;
    if (tokenSet.has('string') || tokenSet.has('array')) schema.maxLength(field, n);
    else schema.max(field, n);
  },
  minLength: ({ schema, field, arg }) => {
    const n = parseNumberArg(arg);
    if (n === null) return;
    schema.minLength(field, n);
  },
  maxLength: ({ schema, field, arg }) => {
    const n = parseNumberArg(arg);
    if (n === null) return;
    schema.maxLength(field, n);
  },
  regex: ({ schema, field, arg }) => {
    if (arg === undefined) return;
    const re = parseRegexLiteral(arg);
    if (re === null) return;
    schema.regex(field, re);
  },
  in: ({ schema, field, arg }) => {
    schema.in(field, parseInArgs(arg));
  },
  confirmed: ({ schema, field }) => {
    schema.custom(
      field,
      (value, data) => value === data[`${field}_confirmation`],
      `${field} confirmation does not match`
    );
  },
  nullable: () => {
    // Not needed here; missing/undefined is already allowed unless required.
  },
  unique: ({ schema, field }) => {
    schema.custom(
      field,
      () => false,
      `${field} unique validation is not supported in the core rule-string API yet`
    );
  },
};

const rulesToSchema = (rules: RuleStringMap): ISchema => {
  const schema = Schema.create();

  for (const [field, input] of Object.entries(rules)) {
    const tokens = splitRuleTokens(input);
    const tokenNames = tokens
      .map((t) => t.split(':', 1)[0]?.trim())
      .filter((t): t is string => typeof t === 'string' && t !== '');
    const tokenSet = new Set(tokenNames);

    for (const token of tokens) {
      const [nameRaw, argRaw] = token.split(':', 2);
      const name = nameRaw.trim();
      const arg = typeof argRaw === 'string' ? argRaw.trim() : undefined;

      const handler = ruleStringTokenHandlers[name];
      if (handler !== undefined) {
        handler({ schema, field, tokenSet, name, arg });
        continue;
      }

      schema.custom(field, () => false, `${field} has unknown rule: ${name}`);
    }
  }

  return schema;
};

const validateRules = (
  data: Record<string, unknown>,
  rules: RuleStringMap
): Record<string, unknown> => {
  return validate(data, rulesToSchema(rules));
};

const isValidRules = (data: Record<string, unknown>, rules: RuleStringMap): boolean => {
  return isValid(data, rulesToSchema(rules));
};

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
  // Sonar S5852: Use a safe regex that avoids backtracking by excluding dots from domain labels
  const emailRegex = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
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
  validator: CustomValidatorFn,
  message: string,
  data: Record<string, unknown> | undefined
): FieldError | null {
  const ok =
    typeof validator === 'function' && validator.length >= 2 && data !== undefined
      ? (validator as (v: unknown, d: Record<string, unknown>) => boolean)(value, data)
      : (validator as (v: unknown) => boolean)(value);

  return ok ? null : { field, message, rule: 'custom' };
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
// Sealed namespace with validation functionality
export const Validator = Object.freeze({
  Schema,
  validate,
  isValid,
  rulesToSchema,
  validateRules,
  isValidRules,
});

/**
 * Export ValidationError for use in tests and applications
 */
export { ValidationError } from '@validation/ValidationError';
export type { FieldError } from '@validation/ValidationError';
