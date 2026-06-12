/**
 * Redaction helpers for @zintrust/trace watchers.
 */

const REDACTED = '****';

const isArrayValue = (value: unknown): value is unknown[] => Array.isArray(value);

const isObjectValue = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizeFields = (fields: string[]): Set<string> => {
  const normalized = new Set<string>();

  for (const field of fields) {
    if (typeof field !== 'string') continue;
    const key = field.trim().toLowerCase();
    if (key !== '') normalized.add(key);
  }

  return normalized;
};

const redactUnknownValue = (
  value: unknown,
  fields: Set<string>,
  seen: WeakSet<object>
): unknown => {
  if (isArrayValue(value)) {
    return value.map((item) => redactUnknownValue(item, fields, seen));
  }

  if (!isObjectValue(value)) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);
  const out: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    out[key] = fields.has(key.toLowerCase())
      ? REDACTED
      : redactUnknownValue(entryValue, fields, seen);
  }

  seen.delete(value);
  return out;
};

const redactQuerySegment = (segment: string, fields: Set<string>): string => {
  const separatorIndex = segment.indexOf('=');
  if (separatorIndex <= 0) return segment;

  const key = segment.slice(0, separatorIndex);
  const value = segment.slice(separatorIndex + 1);
  if (!fields.has(key.toLowerCase())) return `${key}=${value}`;

  return `${key}=${REDACTED}`;
};

export const redactHeaders = (
  headers: Record<string, string>,
  fields: string[]
): Record<string, string> => {
  const lower = normalizeFields(fields);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const keyLower = k.toLowerCase();
    out[k] = lower.has(keyLower) || keyLower.includes('secret') ? REDACTED : v;
  }
  return out;
};

export const redactUnknown = (value: unknown, fields: string[]): unknown => {
  return redactUnknownValue(value, normalizeFields(fields), new WeakSet<object>());
};

export const redactObject = (
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> => {
  const redacted = redactUnknown(obj, fields);
  return isObjectValue(redacted) ? redacted : {};
};

export const redactString = (value: string, fields: string[]): string => {
  const lower = normalizeFields(fields);
  if (value === '') return value;

  let output = '';
  let segmentStart = 0;

  for (let index = 0; index <= value.length; index += 1) {
    const isBoundary = index === value.length || value[index] === '&';
    if (!isBoundary) continue;

    const segment = value.slice(segmentStart, index);
    output += redactQuerySegment(segment, lower);

    if (index < value.length) {
      output += '&';
    }

    segmentStart = index + 1;
  }

  return output;
};
