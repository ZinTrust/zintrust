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
  | 'custom'
  | 'alphanumeric'
  | 'uuid'
  | 'token'
  | 'ipAddress'
  | 'positiveNumber'
  | 'digits'
  | 'decimal'
  | 'url'
  | 'phone'
  | 'date';

export interface ValidationRule {
  rule: Rule;
  value?: unknown;
  message?: string;
}

export type CustomValidatorFn =
  | ((value: unknown) => boolean)
  | ((value: unknown, data: Record<string, unknown>) => boolean);

export interface ISchemaBase<TReturn> {
  required(field: string, message?: string): TReturn;
  string(field: string, message?: string): TReturn;
  number(field: string, message?: string): TReturn;
  integer(field: string, message?: string): TReturn;
  boolean(field: string, message?: string): TReturn;
  array(field: string, message?: string): TReturn;
  email(field: string, message?: string): TReturn;
  min(field: string, value: number, message?: string): TReturn;
  max(field: string, value: number, message?: string): TReturn;
  minLength(field: string, value: number, message?: string): TReturn;
  maxLength(field: string, value: number, message?: string): TReturn;
  regex(field: string, pattern: RegExp, message?: string): TReturn;
  in(field: string, values: unknown[], message?: string): TReturn;
  custom(field: string, validator: CustomValidatorFn, message?: string): TReturn;
  alphanumeric(field: string, message?: string): TReturn;
  uuid(field: string, message?: string): TReturn;
  token(field: string, message?: string): TReturn;
  ipAddress(field: string, message?: string): TReturn;
  positiveNumber(field: string, message?: string): TReturn;
  digits(field: string, message?: string): TReturn;
  decimal(field: string, message?: string): TReturn;
  url(field: string, message?: string): TReturn;
  phone(field: string, message?: string): TReturn;
  date(field: string, message?: string): TReturn;
  getRules(): Map<string, ValidationRule[]>;
}

export type ISchema = ISchemaBase<ISchema>;

export type TypedSchema<T> = ISchemaBase<TypedSchema<T>> & { readonly __type?: T };

export type InferSchema<TSchema> = TSchema extends { readonly __type?: infer T }
  ? unknown extends T
    ? never
    : T
  : never;

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
      alphanumeric: (f, m) => addSimpleRule(schema, rules, f, 'alphanumeric', m),
      uuid: (f, m) => addSimpleRule(schema, rules, f, 'uuid', m),
      token: (f, m) => addSimpleRule(schema, rules, f, 'token', m),
      ipAddress: (f, m) => addSimpleRule(schema, rules, f, 'ipAddress', m),
      positiveNumber: (f, m) => addSimpleRule(schema, rules, f, 'positiveNumber', m),
      digits: (f, m) => addSimpleRule(schema, rules, f, 'digits', m),
      decimal: (f, m) => addSimpleRule(schema, rules, f, 'decimal', m),
      url: (f, m) => addSimpleRule(schema, rules, f, 'url', m),
      phone: (f, m) => addSimpleRule(schema, rules, f, 'phone', m),
      date: (f, m) => addSimpleRule(schema, rules, f, 'date', m),
      getRules: () => rules,
    };

    return schema;
  },

  /**
   * Create a schema instance carrying a declared TypeScript shape.
   * This enables schema-inferred request typing when paired with validation middleware.
   */
  typed<T>(): TypedSchema<T> {
    return Schema.create() as unknown as TypedSchema<T>;
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
    alphanumeric: () => validateAlphanumeric(field, value, message),
    uuid: () => validateUuid(field, value, message),
    token: () => validateToken(field, value, message),
    ipAddress: () => validateIpAddress(field, value, message),
    positiveNumber: () => validatePositiveNumber(field, value, message),
    digits: () => validateDigits(field, value, message),
    decimal: () => validateDecimal(field, value, message),
    url: () => validateUrl(field, value, message),
    phone: () => validatePhone(field, value, message),
    date: () => validateDate(field, value, message),
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
  alphanumeric: ({ schema, field }) => {
    schema.alphanumeric(field);
  },
  uuid: ({ schema, field }) => {
    schema.uuid(field);
  },
  token: ({ schema, field }) => {
    schema.token(field);
  },
  ipAddress: ({ schema, field }) => {
    schema.ipAddress(field);
  },
  ip: ({ schema, field }) => {
    schema.ipAddress(field);
  },
  positiveNumber: ({ schema, field }) => {
    schema.positiveNumber(field);
  },
  positive: ({ schema, field }) => {
    schema.positiveNumber(field);
  },
  digits: ({ schema, field }) => {
    schema.digits(field);
  },
  decimal: ({ schema, field }) => {
    schema.decimal(field);
  },
  url: ({ schema, field }) => {
    schema.url(field);
  },
  phone: ({ schema, field }) => {
    schema.phone(field);
  },
  date: ({ schema, field }) => {
    schema.date(field);
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
function validateAlphanumeric(field: string, value: unknown, message: string): FieldError | null {
  return typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value)
    ? null
    : { field, message, rule: 'alphanumeric' };
}

function validateUuid(field: string, value: unknown, message: string): FieldError | null {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof value === 'string' && uuidRegex.test(value)
    ? null
    : { field, message, rule: 'uuid' };
}

function validateToken(field: string, value: unknown, message: string): FieldError | null {
  return typeof value === 'string' && /^[A-Za-z0-9\-=_]+$/.test(value)
    ? null
    : { field, message, rule: 'token' };
}

function validateIpAddress(field: string, value: unknown, message: string): FieldError | null {
  if (typeof value !== 'string') return { field, message, rule: 'ipAddress' };
  // IPv4: simplified pattern - match four dot-separated numbers (0-255)
  const parts = value.split('.');
  if (parts.length === 4) {
    const isValidIpv4 = parts.every((part) => {
      const num = Number.parseInt(part, 10);
      return /^\d+$/.test(part) && num >= 0 && num <= 255;
    });
    if (isValidIpv4) return null;
  }
  // IPv6 (simplified)
  const ipv6Regex = /^([\da-f]{1,4}:){7}[\da-f]{1,4}$/i;
  return ipv6Regex.test(value) ? null : { field, message, rule: 'ipAddress' };
}

function validatePositiveNumber(field: string, value: unknown, message: string): FieldError | null {
  return typeof value === 'number' && value > 0 ? null : { field, message, rule: 'positiveNumber' };
}

function validateDigits(field: string, value: unknown, message: string): FieldError | null {
  return typeof value === 'string' && /^\d+$/.test(value)
    ? null
    : { field, message, rule: 'digits' };
}

function validateDecimal(field: string, value: unknown, message: string): FieldError | null {
  return typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)
    ? null
    : { field, message, rule: 'decimal' };
}

function validateUrl(field: string, value: unknown, message: string): FieldError | null {
  if (typeof value !== 'string') return { field, message, rule: 'url' };
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { field, message, rule: 'url' };
  } catch {
    return { field, message, rule: 'url' };
  }
}

function validatePhone(field: string, value: unknown, message: string): FieldError | null {
  // International phone format with optional + and spaces/dashes
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  const cleanedValue =
    typeof value === 'string' ? value.replaceAll(/[\s\-()]/g, '') : String(value);
  return phoneRegex.test(cleanedValue) ? null : { field, message, rule: 'phone' };
}

function validateDate(field: string, value: unknown, message: string): FieldError | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { field, message, rule: 'date' } : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? { field, message, rule: 'date' } : null;
  }
  return { field, message, rule: 'date' };
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
    alphanumeric: `${field} must contain only letters and numbers`,
    uuid: `${field} must be a valid UUID`,
    token: `${field} must be a valid token`,
    ipAddress: `${field} must be a valid IP address`,
    positiveNumber: `${field} must be a positive number`,
    digits: `${field} must contain only digits`,
    decimal: `${field} must be a valid decimal number`,
    url: `${field} must be a valid URL`,
    phone: `${field} must be a valid phone number`,
    date: `${field} must be a valid date`,
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
