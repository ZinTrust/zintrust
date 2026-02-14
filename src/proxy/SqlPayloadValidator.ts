export type SqlPayloadValidation =
  | {
      valid: true;
      sql: string;
      params: unknown[];
    }
  | {
      valid: false;
      error: { code: string; message: string };
    };

export const validateSqlPayload = (payload: Record<string, unknown>): SqlPayloadValidation => {
  const sql = payload['sql'];
  const params = Array.isArray(payload['params']) ? payload['params'] : [];

  if (typeof sql !== 'string') {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'sql must be a string',
      },
    };
  }

  return { valid: true, sql, params };
};
