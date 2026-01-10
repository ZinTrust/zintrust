/*
 * TypeScript port of.
 *
 * Notes:
 * - empty() semantics treat "0" as empty; this port preserves that behavior.
 */

export type CleanPolicyLockHandler = (details: {
  raw: unknown;
  message: string;
  context?: string;
}) => void;

export interface CleanPolicyOptions {
  onLock?: CleanPolicyLockHandler;
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === false ||
    value === 0 ||
    value === '' ||
    value === '0'
  );
}

function toStr(value: unknown): string {
  return String(value ?? '');
}

function stripSpaces(value: unknown): string {
  return toStr(value).replaceAll(' ', '');
}

function sanitize(value: unknown, pattern: RegExp, stripSpace = false): string {
  const input = stripSpace ? stripSpaces(value) : toStr(value);
  return input.replace(pattern, '');
}

function isNumericString(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const n = Number(trimmed);
  return Number.isFinite(n);
}

export type CleanPolicy = Readonly<{
  amtCleaner: (value: unknown) => number;
  leterNumberOnly: (value: unknown) => string;
  clean: (value: unknown) => string;
  numberWithDotLocker: (value: unknown) => number | null | string;
  xaddres: (value: unknown) => string;
  xlean: (value: unknown) => string;
  emi: (value: unknown) => string;
  msg: (value: unknown) => string;
  numberWithOutMinus: (value: unknown) => string;
  ipAddressCleaner: (value: unknown) => string;
  nlean: (value: unknown) => string;
  alean: (value: unknown) => string;
  justNumber: (value: unknown) => string;
  dulean: (value: unknown) => string;
  timec: (value: unknown) => string;
  mslean: (value: unknown) => string;
  glean: (value: unknown) => string;
  llean: (value: unknown) => string;
  ulean: (value: unknown) => string;
  hol: (value: unknown) => string;
  dlean: (value: unknown) => string;
  uuidClear: (value: unknown) => string;
  tokenClear: (value: unknown) => string;
  tlean: (value: unknown) => string;
}>;

function createAmtCleaner() {
  return (value: unknown): number => {
    if (isEmpty(value)) return 0;
    const cleaned = sanitize(value, /[^0-9.-]/g, true);
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };
}

function createLeterNumberOnly() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9]/g, true);
  };
}

function createClean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.]/g, true);
  };
}

function createNumberWithDotLocker() {
  return (value: unknown): number | null | string => {
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
}

function createXaddres() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@+, _]/g);
  };
}

function createXlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@+_]/g);
  };
}

function createEmi() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@_]/g);
  };
}

function createMsg() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-.@+_&$%!,()? ]/g);
  };
}

function createNumberWithOutMinus() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^0-9.]/g);
  };
}

function createIpAddressCleaner() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9:.]/g);
  };
}

function createNlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9 .]/g);
  };
}

function createAlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9:-]/g);
  };
}

function createJustNumber() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    const da = sanitize(value, /\D/g);
    return da.replaceAll(' ', '');
  };
}

function createDulean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    // Allow only valid decimal format: digits and at most one decimal point
    const cleaned = sanitize(value, /[^0-9.]/g);
    const parts = cleaned.split('.');
    // Ensure only one decimal point by keeping first part + first decimal part
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
  };
}

function createTimec() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^0-9/]/g);
  };
}

function createMslean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^!@#$%&*/\sA-Za-z0-9_]/g);
  };
}

function createGlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9_\s]/g);
  };
}

function createLlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9]/g).toLowerCase();
  };
}

function createUlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9]/g).toUpperCase();
  };
}

function createHol() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9 ]/g, true);
  };
}

function createDlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^0-9/]/g, true);
  };
}

function createUuidClear() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-=]/g, true);
  };
}

function createTokenClear() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-=_]/g, true);
  };
}

function createTlean() {
  return (value: unknown): string => {
    if (isEmpty(value)) return '';
    return sanitize(value, /[^A-Za-z0-9\-:. ]/g, true);
  };
}

export function createCleanPolicy(): CleanPolicy {
  const amtCleaner = createAmtCleaner();
  const leterNumberOnly = createLeterNumberOnly();
  const clean = createClean();
  const numberWithDotLocker = createNumberWithDotLocker();
  const xaddres = createXaddres();
  const xlean = createXlean();
  const emi = createEmi();
  const msg = createMsg();
  const numberWithOutMinus = createNumberWithOutMinus();
  const ipAddressCleaner = createIpAddressCleaner();
  const nlean = createNlean();
  const alean = createAlean();
  const justNumber = createJustNumber();
  const dulean = createDulean();
  const timec = createTimec();
  const mslean = createMslean();
  const glean = createGlean();
  const llean = createLlean();
  const ulean = createUlean();
  const hol = createHol();
  const dlean = createDlean();
  const uuidClear = createUuidClear();
  const tokenClear = createTokenClear();
  const tlean = createTlean();

  return Object.freeze({
    amtCleaner,
    leterNumberOnly,
    clean,
    numberWithDotLocker,
    xaddres,
    xlean,
    emi,
    msg,
    numberWithOutMinus,
    ipAddressCleaner,
    nlean,
    alean,
    justNumber,
    dulean,
    timec,
    mslean,
    glean,
    llean,
    ulean,
    hol,
    dlean,
    uuidClear,
    tokenClear,
    tlean,
  });
}

export const defaultCleanPolicy = createCleanPolicy();
