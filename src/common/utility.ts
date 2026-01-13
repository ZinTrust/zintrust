import { ErrorFactory } from '@exceptions/ZintrustError';
import { randomBytes } from '@node-singletons/crypto';

export const generateUuid = (): string => {
  if (typeof globalThis?.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; // NOSONAR
};

export function generateSecureJobId(
  errMsg: string = 'Secure crypto API not available to generate a job id.'
): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  // Node fallback for environments without Web Crypto
  try {
    return randomBytes(16).toString('hex');
  } catch (error) {
    throw ErrorFactory.createTryCatchError(
      errMsg || 'Secure crypto API not available to generate a job id.',
      error
    );
  }
}

export const getString = (value: unknown): string => (typeof value === 'string' ? value : '');

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === false ||
    value === 0 ||
    value === '' ||
    value === '0'
  );
}

export function toStr(value: unknown): string {
  return String(value ?? '');
}

export function stripSpaces(value: unknown): string {
  return toStr(value).replaceAll(' ', '');
}

export function sanitize(value: unknown, pattern: RegExp, stripSpace = false): string {
  const input = stripSpace ? stripSpaces(value) : toStr(value);
  return input.replace(pattern, '');
}

export function isNumericString(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const n = Number(trimmed);
  return Number.isFinite(n);
}

export function toPlusDecimal(num: unknown, dec = 8): number {
  if (isEmpty(num)) return 0;

  const numStr = toStr(num);
  const hasDot = numStr.includes('.');
  const hasExponent = /e/i.test(numStr);

  const normalized = hasExponent ? Number(numStr).toFixed(dec + 1) : numStr;

  const valueNew = hasDot
    ? (() => {
        const [whole, frac = ''] = normalized.split('.');
        return Number.parseFloat(`${whole}.${frac.slice(0, dec)}`);
      })()
    : Number.parseFloat(normalized);

  if (valueNew < 0 && String(valueNew).startsWith('-')) {
    return 0;
  }

  return valueNew;
}

export function toMinusDecimal(num: unknown, dec = 8): number {
  if (isEmpty(num)) return 0;

  const numStr = toStr(num);
  const hasDot = numStr.includes('.');
  const hasExponent = /e/i.test(numStr);

  const normalized = hasExponent ? Number(numStr).toFixed(dec + 1) : numStr;

  if (hasDot) {
    const [whole, frac = ''] = normalized.split('.');
    return Number.parseFloat(`${whole}.${frac.slice(0, dec)}`);
  }

  return Number.parseFloat(normalized);
}

export const nowIso = (): string => new Date().toISOString();

export interface UtilitiesType {
  generateUuid: () => string;
  getString: (value: unknown) => string;
  generateSecureJobId: (errMsg?: string) => string;
  isEmpty: (value: unknown) => boolean;
  toStr: (value: unknown) => string;
  stripSpaces: (value: unknown) => string;
  sanitize: (value: unknown, pattern: RegExp, stripSpace?: boolean) => string;
  isNumericString: (value: string) => boolean;
  toPlusDecimal: (num: unknown, dec?: number) => number;
  toMinusDecimal: (num: unknown, dec?: number) => number;
  nowIso: () => string;
}

export const Utilities = Object.freeze({
  generateUuid,
  getString,
  generateSecureJobId,
  isEmpty,
  toStr,
  stripSpaces,
  sanitize,
  isNumericString,
  toPlusDecimal,
  toMinusDecimal,
  nowIso,
});
