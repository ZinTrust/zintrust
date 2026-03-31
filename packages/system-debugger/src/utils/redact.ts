/**
 * Redaction helpers for @zintrust/system-debugger watchers.
 */

const REDACTED = '[REDACTED]';

export const redactHeaders = (
  headers: Record<string, string>,
  fields: string[],
): Record<string, string> => {
  const lower = fields.map((f) => f.toLowerCase());
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = lower.includes(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
};

export const redactObject = (
  obj: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> => {
  const lower = fields.map((f) => f.toLowerCase());
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = lower.includes(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
};

export const redactString = (value: string, fields: string[]): string => {
  // Redact common key=value patterns in query strings
  const lower = fields.map((f) => f.toLowerCase());
  return value.replace(/([^&=?]+)=([^&]+)/g, (_match, key: string, val: string) => {
    return lower.includes(key.toLowerCase()) ? `${key}=${REDACTED}` : `${key}=${val}`;
  });
};
