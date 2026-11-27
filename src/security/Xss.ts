/**
 * XSS Sanitizer
 * Recursive, zero-dependency input sanitization utility.
 *
 * This is intentionally conservative for request-body handling:
 * - Strings: strip markup tags but preserve plain text characters.
 * - Arrays/Objects: sanitize recursively.
 */

type UnknownRecord = Record<string, unknown>;

/**
 * Keys that must never be written into a sanitized object. Assigning an
 * attacker-controlled `__proto__` (or `constructor`/`prototype`) key can
 * pollute Object.prototype via inherited setters (CWE-1321).
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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
    return stripTags(input);
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
      // Skip pollution vectors and define via descriptor so no inherited
      // setter (e.g. `__proto__`) can ever be triggered.
      if (UNSAFE_KEYS.has(key)) continue;
      Object.defineProperty(out, key, {
        value: sanitizeRecursive(value, seen),
        enumerable: true,
        configurable: true,
        writable: true,
      });
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
