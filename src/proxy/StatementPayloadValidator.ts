export type StatementPayloadValidation =
  | {
      valid: true;
      statementId: string;
      params: unknown[];
    }
  | {
      valid: false;
      error: { code: string; message: string };
    };

export const validateStatementPayload = (
  payload: Record<string, unknown>
): StatementPayloadValidation => {
  const statementId = payload['statementId'];
  const params = Array.isArray(payload['params']) ? payload['params'] : [];

  if (typeof statementId !== 'string') {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'statementId must be a string' },
    };
  }

  const trimmed = statementId.trim();
  if (trimmed === '') {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'statementId is required' },
    };
  }

  return { valid: true, statementId: trimmed, params };
};
