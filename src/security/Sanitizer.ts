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
 */

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
  parseAmount: (value: unknown) => number;
  alphanumeric: (value: unknown) => string;
  alphanumericDotDash: (value: unknown) => string;

  /** Returns `null` when value isn't numeric; returns `0` for empty / negative numbers. */
  lockNonNegativeNumberString: (value: unknown) => number | null | string;

  addressText: (value: unknown) => string;
  emailLike: (value: unknown) => string;
  email: (value: unknown) => string;
  messageText: (value: unknown) => string;

  numericDotOnly: (value: unknown) => string;
  ipAddressText: (value: unknown) => string;

  nameText: (value: unknown) => string;
  alphaNumericColonDash: (value: unknown) => string;

  digitsOnly: (value: unknown) => string;
  decimalString: (value: unknown) => string;

  dateSlash: (value: unknown) => string;

  safePasswordChars: (value: unknown) => string;
  wordCharsAndSpaces: (value: unknown) => string;

  lowercaseAlphanumeric: (value: unknown) => string;
  uppercaseAlphanumeric: (value: unknown) => string;

  alphanumericNoSpaces: (value: unknown) => string;
  dateSlashNoSpaces: (value: unknown) => string;

  uuidTokenSafe: (value: unknown) => string;
  tokenSafe: (value: unknown) => string;

  keyLike: (value: unknown) => string;
}>;

const createBasicSanitizers = (): Pick<
  SanitizerType,
  | 'parseAmount'
  | 'alphanumeric'
  | 'alphanumericDotDash'
  | 'lockNonNegativeNumberString'
  | 'digitsOnly'
  | 'decimalString'
  | 'numericDotOnly'
> => {
  const parseAmount = (value: unknown): number => {
    if (isEmpty(value)) return 0;
    const cleaned = sanitize(value, /[^0-9.-]/g, true);
    const num = Number(cleaned);
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

  const lockNonNegativeNumberString = (value: unknown): number | null | string => {
    if (isEmpty(value)) return 0;

    const raw = stripSpaces(value);
    const da = raw.replaceAll(/[^0-9\-.]/g, '');

    const numeric = isNumericString(da);
    if (numeric && Number(da) < 0) return 0;

    if (!numeric) {
      return null;
    }

    return da;
  };

  const digitsOnly = (value: unknown): string => {
    if (isEmpty(value)) return '';
    const da = sanitize(value, /\D/g);
    return da.replaceAll(' ', '');
  };

  const decimalString = (value: unknown): string => {
    if (isEmpty(value)) return '';

    // Allow only valid decimal format: digits and at most one decimal point
    const cleaned = sanitize(value, /[^0-9.]/g);
    const parts = cleaned.split('.');

    // Ensure only one decimal point by keeping first part + first decimal part
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
  };

  const numericDotOnly = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^0-9.]/g);
  };

  return {
    parseAmount,
    alphanumeric,
    alphanumericDotDash,
    lockNonNegativeNumberString,
    digitsOnly,
    decimalString,
    numericDotOnly,
  };
};

const createTextSanitizers = (): Pick<
  SanitizerType,
  | 'addressText'
  | 'emailLike'
  | 'email'
  | 'messageText'
  | 'nameText'
  | 'wordCharsAndSpaces'
  | 'safePasswordChars'
> => {
  const addressText = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@+, _]/g);
  };

  const emailLike = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@+_]/g);
  };

  const email = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@_]/g);
  };

  const messageText = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@+_&$%!,()? ]/g);
  };

  const nameText = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9 .]/g);
  };

  const wordCharsAndSpaces = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9_\s]/g);
  };

  const safePasswordChars = (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^!@#$%&*/\sA-Za-z0-9_]/g);
  };

  return {
    addressText,
    emailLike,
    email,
    messageText,
    nameText,
    wordCharsAndSpaces,
    safePasswordChars,
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
