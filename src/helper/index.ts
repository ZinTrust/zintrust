/**
 * Lightweight validation / type helper utilities used across the codebase.
 * Keep implementations small and dependency-free so they work in both
 * Node and Cloudflare Worker runtimes.
 */

/* -------------------------------------------------------------------------- */
/*                               Type Checkers                                */
/* -------------------------------------------------------------------------- */

/** Check whether value is a string primitive */
export const isString = (value: unknown): value is string => typeof value === 'string';

/** Check whether value is an array */
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

/** Check whether value is an object (and not null/array) */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Check whether value is a function */
export const isFunction = (value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === 'function';

/** Check whether value is a valid Date object */
export const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/* -------------------------------------------------------------------------- */
/*                            Empty / Null Checks                             */
/* -------------------------------------------------------------------------- */

/**
 * Check if value is "empty".
 * Matches legacy behavior: null, undefined, false, 0, '', '0' are all considered empty.
 */
export const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === false ||
  value === 0 ||
  value === '' ||
  value === '0';

/** Check if value is null or string 'null'/'NULL' or empty string */
export const isNull = (value: unknown): boolean =>
  value === null ||
  (typeof value === 'string' && value.trim().toLowerCase() === 'null') ||
  (typeof value === 'string' && value === '');

/** Check if value is undefined */
export const isUndefined = (value: unknown): boolean => value === undefined;

/** Check if value is undefined or satisfies isNull() */
export const isUndefinedOrNull = (value: unknown): boolean => isUndefined(value) || isNull(value);

/* -------------------------------------------------------------------------- */
/*                              Boolean Checks                                */
/* -------------------------------------------------------------------------- */

/**
 * Check whether value is a boolean primitive.
 */
export function isBoolean(value: unknown, allowString?: false): value is boolean;

/**
 * Check whether value is a boolean primitive OR a boolean-like string.
 */
export function isBoolean(value: unknown, allowString: true): value is boolean | string;

/**
 * Implementation
 */
export function isBoolean(value: unknown, allowString = false): value is boolean | string {
  if (typeof value === 'boolean') return true;
  if (!allowString) return false;
  if (typeof value !== 'string' && typeof value !== 'number') return false;

  const v = String(value).trim().toLowerCase();
  return v === 'true' || v === 'false' || v === '1' || v === '0';
}

/** Check if value is a string representation of a boolean (true/false/1/0) */
export const isBooleanString = (value: unknown): boolean =>
  typeof value === 'string' && /^(?:true|false|1|0)$/i.test(value.trim());

/* -------------------------------------------------------------------------- */
/*                              Numeric Checks                                */
/* -------------------------------------------------------------------------- */

/** Check if value is a valid number or numeric string */
export const isNumeric = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (s.length === 0) return false;
  return /^[-+]?\d+(?:\.\d+)?$/.test(s);
};

/**
 * Check if value is an integer.
 */
export function isInt(
  value: unknown,
  allowString?: false,
  conditions?: { min?: number; max?: number }
): value is number;

/**
 * Check if value is an integer OR a string representing an integer.
 */
export function isInt(
  value: unknown,
  allowString: true,
  conditions?: { min?: number; max?: number }
): value is number | string;

/**
 * Implementation
 */
export function isInt(
  value: unknown,
  allowString = false,
  conditions?: { min?: number; max?: number }
): boolean {
  let n: number;

  if (typeof value === 'number') {
    n = value;
  } else if (allowString && typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) {
    n = Number(value);
  } else {
    return false;
  }

  if (!Number.isInteger(n)) return false;
  if (conditions?.min !== undefined && n < conditions.min) return false;
  if (conditions?.max !== undefined && n > conditions.max) return false;
  return true;
}

/**
 * Check if value is a float (finite number).
 */
export function isFloat(
  value: unknown,
  allowString?: false,
  conditions?: { min?: number; max?: number }
): value is number;

/**
 * Check if value is a float OR a string representing a float.
 */
export function isFloat(
  value: unknown,
  allowString: true,
  conditions?: { min?: number; max?: number }
): value is number | string;

/**
 * Implementation
 */
export function isFloat(
  value: unknown,
  allowString = false,
  conditions?: { min?: number; max?: number }
): boolean {
  let n: number;

  if (typeof value === 'number') {
    n = value;
  } else if (
    allowString &&
    typeof value === 'string' &&
    /^[-+]?\d+(?:\.\d+)?$/.test(value.trim())
  ) {
    n = Number(value);
  } else {
    return false;
  }

  if (!Number.isFinite(n)) return false;
  if (conditions?.min !== undefined && n < conditions.min) return false;
  if (conditions?.max !== undefined && n > conditions.max) return false;
  return true;
}

/** Check if value is a valid integer string (supports min/max) */
export const isIntString = (value: unknown, conditions?: { min?: number; max?: number }): boolean =>
  typeof value === 'string' && isInt(value, true, conditions);

/** Check if value is a valid float string (supports min/max) */
export const isFloatString = (
  value: unknown,
  conditions?: { min?: number; max?: number }
): boolean => typeof value === 'string' && isFloat(value, true, conditions);

/* -------------------------------------------------------------------------- */
/*                            String / Format Checks                          */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Check if value is a valid email string */
export const isEmail = (value: unknown): boolean =>
  typeof value === 'string' && EMAIL_RE.test(value);

/** Check if value is a valid URL string (http/https) */
export const isUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Check if string contains only letters */
export const isAlpha = (value: unknown): boolean =>
  typeof value === 'string' && /^[A-Za-z]+$/.test(value);

/** Check if string contains only letters and numbers */
export const isAlphanumeric = (value: unknown): boolean =>
  typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value);

/** Check if string matches regex */
export const isMatch = (value: unknown, regex: RegExp): boolean =>
  typeof value === 'string' && regex.test(value);

/* -------------------------------------------------------------------------- */
/*                            Collection / Length                             */
/* -------------------------------------------------------------------------- */

/** Check if value exists in array */
export const isIn = (value: unknown, array: unknown[]): boolean => array.includes(value);

/** Check if value does not exist in array */
export const isNotIn = (value: unknown, array: unknown[]): boolean => !array.includes(value);

/** Check if string or array has exact length */
export const isLength = (value: unknown, length: number): boolean => {
  if (typeof value === 'string' || Array.isArray(value)) return value.length === length;
  return false;
};

/** Check if string or array has minimum length */
export const isMinLength = (value: unknown, min: number): boolean => {
  if (typeof value === 'string' || Array.isArray(value)) return value.length >= min;
  return false;
};

/** Check if string or array has maximum length */
export const isMaxLength = (value: unknown, max: number): boolean => {
  if (typeof value === 'string' || Array.isArray(value)) return value.length <= max;
  return false;
};

/* -------------------------------------------------------------------------- */
/*                            Non-Empty Checks                                */
/* -------------------------------------------------------------------------- */

/** Check if value is a string with length > 0 (after trim) */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Check if value is an array with items */
export const isNonEmptyArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.length > 0;

/** Check if value is an object with keys */
export const isNonEmptyObject = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && Object.keys(value).length > 0;

/* -------------------------------------------------------------------------- */
/*                          Additional Format Checks                          */
/* -------------------------------------------------------------------------- */

/**
 * Check if value is a string containing only whitespace.
 * Useful for distinguishing between truly empty and whitespace-only strings.
 */
export const isWhitespaceOnly = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value.trim().length === 0;

/**
 * Check if value is a valid UUID v4 string.
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
export const isUUID = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv4Regex.test(value);
};

/**
 * Check if value is a valid JSON string (parses without error).
 */
export const isJSON = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if value is a valid Base64-encoded string.
 */
export const isBase64 = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(value)) return false;
  // Base64 length must be multiple of 4
  return value.length % 4 === 0;
};

/**
 * Check if value is a valid hexadecimal color string.
 * Accepts #RGB, #RGBA, #RRGGBB, #RRGGBBAA formats.
 */
export const isHexColor = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  // Matches: #RGB (3), #RGBA (4), #RRGGBB (6), #RRGGBBAA (8)
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
};

/**
 * Check if value is a valid URL slug (lowercase alphanumeric with hyphens).
 * Example: "my-blog-post", "user-profile-page"
 */
export const isSlug = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
};

/**
 * Check if value is a string with uppercase letters.
 */
export const isUpperCase = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value === value.toUpperCase();

/**
 * Check if value is a string with lowercase letters.
 */
export const isLowerCase = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value === value.toLowerCase();

/* -------------------------------------------------------------------------- */
/*                          Numeric Predicates                                */
/* -------------------------------------------------------------------------- */

/** Check if number is positive (> 0) */
export const isPositive = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Check if number is negative (< 0) */
export const isNegative = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value < 0;

/** Check if number is zero */
export const isZero = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value === 0;

/** Check if number is even */
export const isEven = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value % 2 === 0;

/** Check if number is odd */
export const isOdd = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value % 2 !== 0;

/**
 * Check if number has decimal places.
 * Examples: 1.5 → true, 1.0 → false, 1 → false
 */
export const isDecimal = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value);

/**
 * Check if number is between min and max (inclusive).
 */
export const isBetween = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/**
 * Check if number is divisible by divisor.
 */
export const isDivisibleBy = (value: unknown, divisor: number): boolean =>
  typeof value === 'number' && Number.isInteger(value) && divisor !== 0 && value % divisor === 0;

/* -------------------------------------------------------------------------- */
/*                                Factory Export                              */
/* -------------------------------------------------------------------------- */

export const Helpers = Object.freeze({
  isString,
  isBoolean,
  isBooleanString,
  isEmpty,
  isNull,
  isUndefined,
  isUndefinedOrNull,
  isArray,
  isObject,
  isFunction,
  isDate,
  isEmail,
  isUrl,
  isIn,
  isNotIn,
  isLength,
  isMinLength,
  isMaxLength,
  isMatch,
  isAlpha,
  isAlphanumeric,
  isNumeric,
  isInt,
  isFloat,
  isIntString,
  isFloatString,
  isNonEmptyString,
  isNonEmptyArray,
  isNonEmptyObject,
  isWhitespaceOnly,
  isUUID,
  isJSON,
  isBase64,
  isHexColor,
  isSlug,
  isUpperCase,
  isLowerCase,
  isPositive,
  isNegative,
  isZero,
  isEven,
  isOdd,
  isDecimal,
  isBetween,
  isDivisibleBy,
});
