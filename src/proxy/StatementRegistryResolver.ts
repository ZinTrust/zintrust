import { ErrorHandler } from '@proxy/ErrorHandler';
import type { ProxyResponse } from '@proxy/ProxyBackend';
import { validateStatementPayload } from '@proxy/StatementPayloadValidator';
import { isMutatingSql } from '@proxy/isMutatingSql';

export type ResolvedStatement = Readonly<{
  statementId: string;
  sql: string;
  params: unknown[];
  mutating: boolean;
}>;

export const resolveStatementOrError = (
  statements: Record<string, string> | undefined,
  payload: Record<string, unknown>
): { ok: true; value: ResolvedStatement } | { ok: false; response: ProxyResponse } => {
  if (!statements) {
    return {
      ok: false,
      response: ErrorHandler.toProxyError(400, 'CONFIG_ERROR', 'Missing statement registry'),
    };
  }

  const stmtValidation = validateStatementPayload(payload);
  if (!stmtValidation.valid) {
    return {
      ok: false,
      response: ErrorHandler.toProxyError(
        400,
        stmtValidation.error.code,
        stmtValidation.error.message
      ),
    };
  }

  const sql = statements[stmtValidation.statementId];
  if (typeof sql !== 'string' || sql.trim() === '') {
    return {
      ok: false,
      response: ErrorHandler.toProxyError(404, 'NOT_FOUND', 'Unknown statementId'),
    };
  }

  return {
    ok: true,
    value: {
      statementId: stmtValidation.statementId,
      sql,
      params: stmtValidation.params,
      mutating: isMutatingSql(sql),
    },
  };
};
