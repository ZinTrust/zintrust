/**
 * XSS Sanitizer
 * Recursive, zero-dependency input sanitization utility.
 *
 * This is intentionally conservative:
 * - Strings: strip tags, then escape HTML entities.
 * - Arrays/Objects: sanitize recursively.
 */

import { XssProtection } from '@security/XssProtection';

type UnknownRecord = Record<string, unknown>;

const stripTags = (value: string): string => {
  // Remove all HTML tags in linear time (no regex backtracking / ReDoS risk).
  let out = '';
  let inTag = false;

  for (const element of value) {
    const ch = element;

    if (ch === '<') {
      inTag = true;
      continue;
    }

    if (inTag) {
      if (ch === '>') inTag = false;
      continue;
    }

    out += ch;
  }

  return out;
};

const sanitizeRecursive = (input: unknown, seen: WeakSet<object>): unknown => {
  if (typeof input === 'string') {
    return XssProtection.escape(stripTags(input));
  }

  if (Array.isArray(input)) {
    if (seen.has(input)) return input;
    seen.add(input);
    return input.map((item) => sanitizeRecursive(item, seen));
  }

  if (typeof input === 'object' && input !== null) {
    const obj = input as UnknownRecord;
    if (seen.has(obj)) return input;
    seen.add(obj);

    const out: UnknownRecord = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = sanitizeRecursive(value, seen);
    }
    return out;
  }

  return input;
};

export interface IXss {
  sanitize(input: unknown): unknown;
}

export const Xss: IXss = Object.freeze({
  sanitize(input: unknown): unknown {
    return sanitizeRecursive(input, new WeakSet<object>());
  },
});

export default Xss;
