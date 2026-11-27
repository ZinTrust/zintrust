import { Env } from '@config/env';

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

  // Raw SQL is denied by default in production. Use registered statement IDs instead,
  // or explicitly opt in with ALLOW_RAW_PROXY_SQL=true (development/test keep the old behaviour).
  const rawSqlAllowed = Env.getBool('ALLOW_RAW_PROXY_SQL', Env.NODE_ENV !== 'production');
  if (!rawSqlAllowed) {
    return {
      valid: false,
      error: {
        code: 'RAW_SQL_DISABLED',
        message: 'Raw SQL is disabled. Use a registered statement ID or set ALLOW_RAW_PROXY_SQL=true.',
      },
    };
  }

  return { valid: true, sql, params };
};
