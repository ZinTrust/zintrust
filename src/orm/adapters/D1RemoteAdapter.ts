/**
 * D1 Remote Database Adapter
 *
 * Calls a ZinTrust Cloudflare Worker proxy over HTTPS.
 */

import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
import type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';
import { SignedRequest } from '@security/SignedRequest';

type D1RemoteMode = 'registry' | 'sql';

type D1QueryResponse = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

type D1QueryOneResponse = {
  row: Record<string, unknown> | null;
};

type D1ExecResponse = {
  ok: boolean;
  meta?: { changes?: number; lastRowId?: number | string | bigint; durationMs?: number };
};

type D1StatementResponse = D1QueryResponse | D1QueryOneResponse | D1ExecResponse;

type D1RemoteSettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
  mode: D1RemoteMode;
};

const resolveSigningPrefix = (baseUrl: string): string | undefined => {
  try {
    const parsed = new URL(baseUrl);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    if (path === '' || path === '/') return undefined;
    return path;
  } catch {
    return undefined;
  }
};

const createRemoteConfig = (): { mode: D1RemoteMode; remote: RemoteSignedJsonSettings } => {
  const settings: D1RemoteSettings = {
    baseUrl: Env.get('D1_REMOTE_URL'),
    keyId: Env.get('D1_REMOTE_KEY_ID'),
    secret: Env.get('D1_REMOTE_SECRET', Env.APP_KEY),
    mode: (Env.get('D1_REMOTE_MODE', 'registry') as D1RemoteMode) ?? 'registry',
    timeoutMs: Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT),
  };

  const remote: RemoteSignedJsonSettings = {
    baseUrl: settings.baseUrl,
    keyId: settings.keyId,
    secret: settings.secret,
    timeoutMs: settings.timeoutMs,
    signaturePathPrefixToStrip: resolveSigningPrefix(settings.baseUrl),
    missingUrlMessage: 'D1 remote proxy URL is missing (D1_REMOTE_URL)',
    missingCredentialsMessage:
      'D1 remote signing credentials are missing (D1_REMOTE_KEY_ID / D1_REMOTE_SECRET)',
    messages: {
      unauthorized: 'D1 remote proxy unauthorized',
      forbidden: 'D1 remote proxy forbidden',
      rateLimited: 'D1 remote proxy rate limited',
      rejected: 'D1 remote proxy rejected request',
      error: 'D1 remote proxy error',
      timedOut: 'D1 remote proxy request timed out',
    },
  };

  return { mode: settings.mode, remote };
};

const isMutatingSql = (sql: string): boolean => {
  const s = sql.trimStart().toLowerCase();
  return (
    s.startsWith('insert') ||
    s.startsWith('update') ||
    s.startsWith('delete') ||
    s.startsWith('create') ||
    s.startsWith('drop') ||
    s.startsWith('alter') ||
    s.startsWith('replace')
  );
};

const createStatementPayload = async (
  sql: string,
  parameters: unknown[]
): Promise<Record<string, unknown>> => {
  const statementId = await SignedRequest.sha256Hex(sql);
  return { statementId, params: parameters };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isQueryResponse = (value: unknown): value is D1QueryResponse =>
  isRecord(value) &&
  Array.isArray(value['rows']) &&
  typeof value['rowCount'] === 'number' &&
  (value['rows'] as unknown[]).every((r) => isRecord(r));

const isQueryOneResponse = (value: unknown): value is D1QueryOneResponse =>
  isRecord(value) && 'row' in value && (value['row'] === null || isRecord(value['row']));

const getExecMeta = (value: unknown): { changes: number; lastRowId?: number | string | bigint } => {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') return { changes: 0 };
  const meta = value['meta'];
  if (!isRecord(meta)) return { changes: 0 };

  const changes = typeof meta['changes'] === 'number' ? meta['changes'] : 0;
  const lastRowIdCandidate =
    meta['lastRowId'] ??
    meta['last_row_id'] ??
    meta['lastInsertRowid'] ??
    meta['last_insert_rowid'];

  const lastRowId =
    typeof lastRowIdCandidate === 'number' ||
    typeof lastRowIdCandidate === 'string' ||
    typeof lastRowIdCandidate === 'bigint'
      ? lastRowIdCandidate
      : undefined;

  return { changes, lastRowId };
};

const queryRegistry = async (
  settings: RemoteSignedJsonSettings,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> => {
  const payload = await createStatementPayload(sql, parameters);
  const out = await RemoteSignedJson.request<D1StatementResponse>(
    settings,
    '/zin/d1/statement',
    payload
  );

  if (isQueryResponse(out)) {
    return { rows: out.rows, rowCount: out.rowCount };
  }
  if (isQueryOneResponse(out)) {
    const row = out.row;
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  const meta = getExecMeta(out);
  return { rows: [], rowCount: meta.changes, lastInsertId: meta.lastRowId };
};

const querySqlMode = async (
  settings: RemoteSignedJsonSettings,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> => {
  if (isMutatingSql(sql)) {
    const out = await RemoteSignedJson.request<D1ExecResponse>(settings, '/zin/d1/exec', {
      sql,
      params: parameters,
    });
    const meta = getExecMeta(out);
    return { rows: [], rowCount: meta.changes, lastInsertId: meta.lastRowId };
  }

  const out = await RemoteSignedJson.request<D1QueryResponse>(settings, '/zin/d1/query', {
    sql,
    params: parameters,
  });
  return { rows: out.rows, rowCount: out.rowCount };
};

export const D1RemoteAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    const { mode, remote } = createRemoteConfig();

    return {
      // eslint-disable-next-line @typescript-eslint/require-await
      async connect(): Promise<void> {
        connected = true;
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      async disconnect(): Promise<void> {
        connected = false;
      },

      async query(sql: string, parameters: unknown[]): Promise<QueryResult> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        if (mode === 'registry') {
          return queryRegistry(remote, sql, parameters);
        }

        return querySqlMode(remote, sql, parameters);
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        if (mode === 'registry') {
          const payload = await createStatementPayload(sql, parameters);
          const out = await RemoteSignedJson.request<D1StatementResponse>(
            remote,
            '/zin/d1/statement',
            payload
          );
          if (isQueryOneResponse(out)) return out.row;
          if (isQueryResponse(out)) return out.rows[0] ?? null;
          return null;
        }

        const out = await RemoteSignedJson.request<D1QueryOneResponse>(remote, '/zin/d1/queryOne', {
          sql,
          params: parameters,
        });
        return out.row;
      },

      async ping(): Promise<void> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        const sql = QueryBuilder.create('').select('1').toSQL();
        await this.queryOne(sql, []);
      },

      async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');
        try {
          return await callback(this);
        } catch (error: unknown) {
          throw ErrorFactory.createTryCatchError('Transaction failed', error);
        }
      },

      async rawQuery<T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> {
        const out = await this.query(sql, parameters);
        return out.rows as T[];
      },

      getType(): SupportedDriver {
        return AdaptersEnum.d1Remote;
      },
      isConnected(): boolean {
        return connected;
      },
      getPlaceholder(_index: number): string {
        return '?';
      },
    };
  },
});

export default D1RemoteAdapter;
