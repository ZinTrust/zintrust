/**
 * Input Sanitizer (Character Whitelisting)
 *
 * Provides small utilities to remove unwanted characters from user input.
 *
 * Important:
 * - This is NOT a complete SQL injection defense.
 * - Always use parameterized queries / the ORM / QueryBuilder.
 *
 * Use this for:
 * - Normalizing identifiers (username, slug-ish strings)
 * - Cleaning phone numbers / numeric strings
 * - Reducing unexpected characters before storage/logging
 *
 * Bulletproof Mode:
 * - Enabled by default (`bulletproof=true`) for security-critical methods
 * - Throws SanitizerError instead of returning empty/invalid values
 * - Validates numeric ranges, leading zeros, type coercion attacks
 * - ~5-15% performance overhead; disable for performance-critical paths
 */

import { ErrorFactory } from '@exceptions/ZintrustError';

const MAX_NUMERIC_INPUT_LEN = 64;
const MAX_EMAIL_LEN = 254;
const MAX_NAME_LEN = 200;
const MAX_PASSWORD_LEN = 256;

const assertMaxLen = (method: string, label: string, value: string, maxLen: number): void => {
  if (value.length <= maxLen) return;
  throw ErrorFactory.createSanitizerError(method, `${label} too long`, value);
};

const isEmpty = (value: unknown): boolean => {
  // Preserve legacy semantics: treat 0 and "0" as empty.
  return (
    value === null ||
    value === undefined ||
    value === false ||
    value === 0 ||
    value === '' ||
    value === '0'
  );
};

const toStr = (value: unknown): string => {
  return String(value ?? '');
};

const stripSpaces = (value: unknown): string => {
  return toStr(value).replaceAll(' ', '');
};

const sanitize = (value: unknown, pattern: RegExp, stripSpace = false): string => {
  const input = stripSpace ? stripSpaces(value) : toStr(value);
  return input.replace(pattern, '');
};

const isNumericString = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const n = Number(trimmed);
  return Number.isFinite(n);
};

export type SanitizerType = Readonly<{
  parseAmount: (value: unknown, bulletproof?: boolean) => number;
  alphanumeric: (value: unknown) => string;
  alphanumericDotDash: (value: unknown) => string;

  /** Returns `null` when value isn't numeric; returns `0` for empty / negative numbers. */
  nonNegativeNumericStringOrNull: (value: unknown, bulletproof?: boolean) => number | null | string;

  addressText: (value: unknown) => string;
  emailLike: (value: unknown) => string;
  email: (value: unknown, bulletproof?: boolean) => string;
  messageText: (value: unknown) => string;

  numericDotOnly: (value: unknown) => string;
  ipAddressText: (value: unknown) => string;

  nameText: (value: unknown, bulletproof?: boolean) => string;
  alphaNumericColonDash: (value: unknown) => string;

  digitsOnly: (value: unknown, bulletproof?: boolean) => string;
  decimalString: (value: unknown, bulletproof?: boolean) => string;

  dateSlash: (value: unknown) => string;

  safePasswordChars: (value: unknown, bulletproof?: boolean) => string;
  wordCharsAndSpaces: (value: unknown) => string;

  lowercaseAlphanumeric: (value: unknown) => string;
  uppercaseAlphanumeric: (value: unknown) => string;

  alphanumericNoSpaces: (value: unknown) => string;
  dateSlashNoSpaces: (value: unknown) => string;

  uuidTokenSafe: (value: unknown) => string;
  tokenSafe: (value: unknown) => string;

  keyLike: (value: unknown) => string;
}>;

const parseAmount = (value: unknown, bulletproof: boolean = true): number => {
  if (isEmpty(value)) return 0;

  const cleaned = sanitize(value, /[^0-9.-]/g, true);
  const num = Number(cleaned);

  if (bulletproof) {
    // Handle string edge cases - check original value
    const str = String(value);
    const trimmed = str.trim();

    assertMaxLen('parseAmount', 'Input', trimmed, MAX_NUMERIC_INPUT_LEN);

    // Reject explicit plus sign prefixes (type confusion)
    if (trimmed.startsWith('+')) {
      throw ErrorFactory.createSanitizerError('parseAmount', 'Plus sign not allowed', value);
    }

    // Reject "Infinity", "-Infinity", "NaN" explicitly
    if (/^[+-]?infinity$/i.test(trimmed) || /^nan$/i.test(trimmed)) {
      throw ErrorFactory.createSanitizerError('parseAmount', 'Non-finite number', value);
    }

    // Reject scientific notation (e.g., "1e308", "2.5e10")
    if (/[eE]/.test(trimmed)) {
      throw ErrorFactory.createSanitizerError(
        'parseAmount',
        'Scientific notation not allowed',
        value
      );
    }

    assertMaxLen('parseAmount', 'Sanitized numeric', cleaned, MAX_NUMERIC_INPUT_LEN);

    // Require a strict numeric shape after sanitization (prevents "1-2" -> NaN etc.)
    if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
      throw ErrorFactory.createSanitizerError('parseAmount', 'Invalid numeric format', value);
    }

    // Reject Infinity, NaN, and overflow attacks
    if (!Number.isFinite(num)) {
      throw ErrorFactory.createSanitizerError('parseAmount', 'Non-finite number', value);
    }

    if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
      throw ErrorFactory.createSanitizerError(
        'parseAmount',
        'Number exceeds safe integer range',
        value
      );
    }
  }

  return Number.isFinite(num) ? num : 0;
};

const alphanumeric = (value: unknown): string => {
  if (isEmpty(value)) return '';
  return sanitize(value, /[^A-Za-z0-9]/g, true);
};

const alphanumericDotDash = (value: unknown): string => {
  if (isEmpty(value)) return '';
  return sanitize(value, /[^A-Za-z0-9\-.]/g, true);
};

const validateNonNegativeNumericStringPreSanitization = (trimmed: string, value: unknown): void => {
  assertMaxLen('nonNegativeNumericStringOrNull', 'Input', trimmed, MAX_NUMERIC_INPUT_LEN);

  // Reject explicit plus sign prefixes (type confusion)
  if (trimmed.startsWith('+')) {
    throw ErrorFactory.createSanitizerError(
      'nonNegativeNumericStringOrNull',
      'Plus sign not allowed',
      value
    );
  }

  // Reject scientific notation before sanitization can mask it
  if (/[eE]/.test(trimmed)) {
    throw ErrorFactory.createSanitizerError(
      'nonNegativeNumericStringOrNull',
      'Scientific notation not allowed',
      value
    );
  }
};

const validateNonNegativeNumericStringPostSanitization = (da: string, value: unknown): void => {
  assertMaxLen('nonNegativeNumericStringOrNull', 'Sanitized numeric', da, MAX_NUMERIC_INPUT_LEN);

  // Strict shape: allow optional leading '-' and optional fractional part.
  if (!/^-?\d+(?:\.\d+)?$/.test(da)) {
    throw ErrorFactory.createSanitizerError(
      'nonNegativeNumericStringOrNull',
      'Invalid numeric format',
      value
    );
  }

  // For integers (no decimal point), validate leading zeros
  if (da.includes('.')) {
    // For decimals, only check overflow
    const num = Number(da);
    if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
      throw ErrorFactory.createSanitizerError(
        'nonNegativeNumericStringOrNull',
        'Number exceeds safe integer range',
        value
      );
    }
  } else {
    const numericId = Number.parseInt(da, 10);
    if (
      !Number.isFinite(numericId) ||
      numericId < 0 ||
      numericId > Number.MAX_SAFE_INTEGER ||
      numericId.toString() !== da
    ) {
      throw ErrorFactory.createSanitizerError(
        'nonNegativeNumericStringOrNull',
        'Invalid numeric format (leading zeros, overflow, or type mismatch)',
        value
      );
    }
  }
};

const nonNegativeNumericStringOrNull = (
  value: unknown,
  bulletproof: boolean = true
): number | null | string => {
  if (isEmpty(value)) return 0;

  const raw = stripSpaces(value);
  if (bulletproof) {
    const trimmed = raw.trim();
    validateNonNegativeNumericStringPreSanitization(trimmed, value);
  }

  const da = raw.replaceAll(/[^0-9\-.]/g, '');

  const numeric = isNumericString(da);
  if (numeric && Number(da) < 0) return 0;

  if (!numeric) {
    return null;
  }

  if (bulletproof) {
    validateNonNegativeNumericStringPostSanitization(da, value);
  }

  return da;
};

const digitsOnly = (value: unknown, bulletproof: boolean = true): string => {
  // Special handling for '0' string
  if (value === '0') {
    if (bulletproof) {
      throw ErrorFactory.createSanitizerError(
        'digitsOnly',
        'Invalid numeric ID (zero, negative, overflow, or leading zeros)',
        value
      );
    }
    return '0';
  }
  if (isEmpty(value)) return '';

  const da = sanitize(value, /\D/g);

  if (bulletproof) {
    assertMaxLen('digitsOnly', 'Sanitized numeric', da, 16);

    // After removing non-digits, check if result is empty
    if (da.length === 0) {
      throw ErrorFactory.createSanitizerError(
        'digitsOnly',
        'Empty result after removing non-digits',
        value
      );
    }

    // Check for special characters that get stripped (like +)
    const str = String(value);
    if (/^[+-]/.test(str.trim())) {
      throw ErrorFactory.createSanitizerError(
        'digitsOnly',
        'Invalid numeric ID (starts with +/- sign)',
        value
      );
    }

    const numericId = Number.parseInt(da, 10);
    if (
      !Number.isFinite(numericId) ||
      numericId <= 0 ||
      numericId > Number.MAX_SAFE_INTEGER ||
      numericId.toString() !== da
    ) {
      throw ErrorFactory.createSanitizerError(
        'digitsOnly',
        'Invalid numeric ID (zero, negative, overflow, or leading zeros)',
        value
      );
    }
  }
  return da.replaceAll(' ', '');
};

const validateDecimalStringPreSanitization = (trimmed: string, value: unknown): void => {
  assertMaxLen('decimalString', 'Input', trimmed, MAX_NUMERIC_INPUT_LEN);

  // Reject explicit plus/minus prefixes and scientific notation (type confusion)
  if (/^[+-]/.test(trimmed)) {
    throw ErrorFactory.createSanitizerError('decimalString', 'Signed values not allowed', value);
  }
  if (/[eE]/.test(trimmed)) {
    throw ErrorFactory.createSanitizerError(
      'decimalString',
      'Scientific notation not allowed',
      value
    );
  }
};

const validateDecimalStringPostSanitization = (
  result: string,
  cleaned: string,
  value: unknown
): void => {
  assertMaxLen('decimalString', 'Sanitized numeric', cleaned, MAX_NUMERIC_INPUT_LEN);

  if (result.length === 0) {
    throw ErrorFactory.createSanitizerError(
      'decimalString',
      'Empty result after sanitization',
      value
    );
  }

  if (!/^\d+(?:\.\d+)?$/.test(result)) {
    throw ErrorFactory.createSanitizerError('decimalString', 'Invalid decimal format', value);
  }

  const num = Number(result);
  if (!Number.isFinite(num)) {
    throw ErrorFactory.createSanitizerError('decimalString', 'Non-numeric decimal value', value);
  }

  if (Math.abs(num) > Number.MAX_SAFE_INTEGER) {
    throw ErrorFactory.createSanitizerError(
      'decimalString',
      'Decimal value exceeds safe range',
      value
    );
  }
};

const decimalString = (value: unknown, bulletproof: boolean = true): string => {
  if (isEmpty(value)) return '';

  if (bulletproof) {
    const trimmed = String(value).trim();
    validateDecimalStringPreSanitization(trimmed, value);
  }

  // Allow only valid decimal format: digits and at most one decimal point
  const cleaned = sanitize(value, /[^0-9.]/g);
  const parts = cleaned.split('.');

  // Bulletproof mode: reject multiple decimal points rather than merging.
  // Legacy/unsafe mode: normalize by keeping the first decimal point.
  let result: string;
  if (parts.length > 2) {
    result = bulletproof ? '' : `${parts[0]}.${parts.slice(1).join('')}`;
  } else {
    result = cleaned;
  }

  if (bulletproof) {
    validateDecimalStringPostSanitization(result, cleaned, value);
  }

  return result;
};

const numericDotOnly = (value: unknown): string => {
  if (isEmpty(value)) return '';
  return sanitize(value, /[^0-9.]/g);
};

const createBasicSanitizers = (): Pick<
  // NOSONAR bulletproof security requires comprehensive validation logic
  SanitizerType,
  | 'parseAmount'
  | 'alphanumeric'
  | 'alphanumericDotDash'
  | 'nonNegativeNumericStringOrNull'
  | 'digitsOnly'
  | 'decimalString'
  | 'numericDotOnly'
> => {
  return {
    parseAmount,
    alphanumeric,
    alphanumericDotDash,
    nonNegativeNumericStringOrNull,
    digitsOnly,
    decimalString,
    numericDotOnly,
  };
};

const addressTextSanitizer = (value: unknown): string => {
  if (isEmpty(value)) return '';
  return sanitize(value, /[^A-Za-z0-9\-.@+, _]/g);
};

const emailLikeSanitizer = (value: unknown): string => {
  if (isEmpty(value)) return '';
  return sanitize(value, /[^A-Za-z0-9\-.@+_]/g);
};

const emailSanitizer = (value: unknown, bulletproof: boolean = true): string => {
  if (isEmpty(value)) return '';
  const result = sanitize(value, /[^A-Za-z0-9\-.@_]/g);

  if (bulletproof) {
    const trimmed = result.trim();
    assertMaxLen('email', 'Email', trimmed, MAX_EMAIL_LEN);
    if (trimmed.length === 0) {
      throw ErrorFactory.createSanitizerError('email', 'Empty result after sanitization', value);
    }
    if (!trimmed.includes('@')) {
      throw ErrorFactory.createSanitizerError('email', 'Missing @ symbol in email', value);
    }
    // Basic validation: something@something
    const parts = trimmed.split('@');
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
      throw ErrorFactory.createSanitizerError('email', 'Invalid email format', value);
    }
  }

  return result;
};

const messageTextSanitizer = (value: unknown): string => {
  if (isEmpty(value)) return '';
  return sanitize(value, /[^A-Za-z0-9\-.@+_&$%!,()? ]/g);
};

const nameTextSanitizer = (value: unknown, bulletproof: boolean = true): string => {
  if (isEmpty(value)) return '';
  const result = sanitize(value, /[^A-Za-z0-9 .]/g);

  if (bulletproof) {
    const trimmed = result.trim();
    assertMaxLen('nameText', 'Name', trimmed, MAX_NAME_LEN);
    if (trimmed.length === 0) {
      throw ErrorFactory.createSanitizerError('nameText', 'Empty or whitespace-only result', value);
    }
    // Names should have at least one letter
    if (!/[A-Za-z]/.test(trimmed)) {
      throw ErrorFactory.createSanitizerError(
        'nameText',
        'Name must contain at least one letter',
        value
      );
    }
  }

  return result;
};

const wordCharsAndSpacesSanitizer = (value: unknown): string => {
  if (isEmpty(value)) return '';
  return sanitize(value, /[^A-Za-z0-9_\s]/g);
};

const safePasswordCharsSanitizer = (value: unknown, bulletproof: boolean = true): string => {
  if (isEmpty(value)) return '';
  const result = sanitize(value, /[^!@#$%&*/\sA-Za-z0-9_]/g);

  if (bulletproof) {
    const trimmed = result.trim();
    assertMaxLen('safePasswordChars', 'Password', trimmed, MAX_PASSWORD_LEN);
    if (trimmed.length === 0) {
      throw ErrorFactory.createSanitizerError(
        'safePasswordChars',
        'Empty result after sanitization',
        value
      );
    }
  }

  return result;
};

const createTextSanitizers = (): Pick<
  // NOSONAR bulletproof security requires comprehensive validation logic
  SanitizerType,
  | 'addressText'
  | 'emailLike'
  | 'email'
  | 'messageText'
  | 'nameText'
  | 'wordCharsAndSpaces'
  | 'safePasswordChars'
> => {
  return {
    addressText: addressTextSanitizer,
    emailLike: emailLikeSanitizer,
    email: emailSanitizer,
    messageText: messageTextSanitizer,
    nameText: nameTextSanitizer,
    wordCharsAndSpaces: wordCharsAndSpacesSanitizer,
    safePasswordChars: safePasswordCharsSanitizer,
  };
};

const createSpecializedSanitizers = (): Pick<
  SanitizerType,
  | 'ipAddressText'
  | 'alphaNumericColonDash'
  | 'dateSlash'
  | 'lowercaseAlphanumeric'
  | 'uppercaseAlphanumeric'
  | 'alphanumericNoSpaces'
  | 'dateSlashNoSpaces'
  | 'uuidTokenSafe'
  | 'tokenSafe'
  | 'keyLike'
> => {
  const ipAddressText = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9:.]/g);
  };

  const alphaNumericColonDash = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9:-]/g);
  };

  const dateSlash = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^0-9/]/g);
  };

  const lowercaseAlphanumeric = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9]/g).toLowerCase();
  };

  const uppercaseAlphanumeric = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9]/g).toUpperCase();
  };

  const alphanumericNoSpaces = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9 ]/g, true);
  };

  const dateSlashNoSpaces = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^0-9/]/g, true);
  };

  // Legacy naming was misleading; this is closer to a "uuid/token safe" whitelist.
  const uuidTokenSafe = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-=]/g, true);
  };

  // Base64url-like (plus "=") token whitelisting.
  const tokenSafe = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-=_]/g, true);
  };

  const keyLike = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-:. ]/g, true);
  };

  return {
    ipAddressText,
    alphaNumericColonDash,
    dateSlash,
    lowercaseAlphanumeric,
    uppercaseAlphanumeric,
    alphanumericNoSpaces,
    dateSlashNoSpaces,
    uuidTokenSafe,
    tokenSafe,
    keyLike,
  };
};

export const createSanitizer = (): SanitizerType => {
  return Object.freeze({
    ...createBasicSanitizers(),
    ...createTextSanitizers(),
    ...createSpecializedSanitizers(),
  });
};

export const Sanitizer = createSanitizer();
