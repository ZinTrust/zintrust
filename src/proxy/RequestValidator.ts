import { isObject } from '@helper/index';

export type ValidationError = Readonly<{ code: string; message: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> => isObject(value);

const parseJson = (
  body: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: ValidationError } => {
  if (body.trim() === '') {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Body is required' } };
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (!isRecord(parsed)) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Body must be an object' } };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: { code: 'INVALID_JSON', message: String(error) } };
  }
};

const requirePost = (method: string | undefined): ValidationError | null => {
  if (method === 'POST') return null;
  return { code: 'METHOD_NOT_ALLOWED', message: 'POST only' };
};

export const RequestValidator = Object.freeze({
  parseJson,
  requirePost,
});
