const SENSITIVE_KEY_PATTERN =
  /pass(word)?|token|secret|api[_-]?key|auth|authorization|cookie|session|credential|private[_-]?key/i;
const SECRET_VALUE_PATTERN =
  /(bearer\s+[a-z0-9._-]+|sk_[a-z0-9]{8,}|pk_[a-z0-9]{8,}|[a-f0-9]{32,})/gi;

const redactString = (value: string): string => {
  if (value.trim() === '') return value;
  return value.replace(SECRET_VALUE_PATTERN, '[REDACTED]');
};

const sanitizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(source)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
        continue;
      }
      result[key] = sanitizeValue(val);
    }

    return result;
  }

  return String(value);
};

export const QueueDataRedactor = Object.freeze({
  sanitizePayload<T>(payload: T): T {
    return sanitizeValue(payload) as T;
  },

  redactText(value: string): string {
    return redactString(value);
  },
});

export default QueueDataRedactor;
