/**
 * Redaction helpers for @zintrust/system-debugger watchers.
 */

const REDACTED = '[REDACTED]';

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
  const lower = new Set(fields.map((f) => f.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = lower.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
};

export const redactObject = (
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> => {
  const lower = new Set(fields.map((f) => f.toLowerCase()));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = lower.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
};

export const redactString = (value: string, fields: string[]): string => {
  const lower = new Set(fields.map((f) => f.toLowerCase()));
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
