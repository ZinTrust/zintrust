import { Env } from '@config/env';
import { isRecord } from '@orm/adapters/SqlProxyAdapterUtils';
import { SignedRequest } from '@security/SignedRequest';

export type SqlProxyMode = 'sql' | 'registry';

export const resolveSqlProxyMode = (envKey: string): SqlProxyMode => {
  const raw = Env.get(envKey, 'sql').trim().toLowerCase();
  return raw === 'registry' ? 'registry' : 'sql';
};

export const createStatementId = async (sql: string): Promise<string> => {
  return SignedRequest.sha256Hex(sql);
};

export const createStatementPayload = async (
  sql: string,
  parameters: unknown[]
): Promise<{ statementId: string; params: unknown[] }> => {
  const statementId = await createStatementId(sql);
  return { statementId, params: parameters };
};

export const getExecMetaWithLastRowId = (
  value: unknown
): { changes: number; lastRowId?: number | string | bigint } => {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') return { changes: 0 };
  const meta = value['meta'];
  if (!isRecord(meta)) return { changes: 0 };
  const changes = typeof meta['changes'] === 'number' ? meta['changes'] : 0;
  const lastRowId = meta['lastRowId'];
  return { changes, lastRowId: lastRowId as number | string | bigint | undefined };
};
