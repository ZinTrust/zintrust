/**
 * D1 Remote Database Adapter
 *
 * Calls a Zintrust Cloudflare Worker proxy over HTTPS.
 */

import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
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
  meta?: { changes?: number; lastRowId?: number; durationMs?: number };
};

type D1StatementResponse = D1QueryResponse | D1QueryOneResponse | D1ExecResponse;

type D1RemoteSettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
  mode: D1RemoteMode;
};

const joinUrl = (baseUrl: string, path: string): URL => {
  const u = new URL(baseUrl);
  const basePath = u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname;
  const next = path.startsWith('/') ? path : `/${path}`;
  u.pathname = `${basePath}${next}`;
  u.search = '';
  return u;
};

const asJson = async (resp: Response): Promise<unknown> => {
  const text = await resp.text();
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
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

const requireConfigured = (settings: D1RemoteSettings): void => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('D1 remote proxy URL is missing (D1_REMOTE_URL)');
  }
  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    throw ErrorFactory.createConfigError(
      'D1 remote signing credentials are missing (D1_REMOTE_KEY_ID / D1_REMOTE_SECRET)'
    );
  }
};

const createTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (timeoutMs <= 0) return undefined;
  const timeout = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;
  return typeof timeout === 'function' ? timeout(timeoutMs) : undefined;
};

const requestJson = async <T>(
  settings: D1RemoteSettings,
  path: string,
  payload: Record<string, unknown>
): Promise<T> => {
  requireConfigured(settings);

  const url = joinUrl(settings.baseUrl, path);
  const body = JSON.stringify(payload);
  const signed = await SignedRequest.createHeaders({
    method: 'POST',
    url,
    body,
    keyId: settings.keyId,
    secret: settings.secret,
  });

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...signed },
      body,
      signal: createTimeoutSignal(settings.timeoutMs),
    });

    if (!resp.ok) {
      const details = await asJson(resp);

      if (resp.status === 401) {
        throw ErrorFactory.createUnauthorizedError('D1 remote proxy unauthorized', details);
      }
      if (resp.status === 403) {
        throw ErrorFactory.createForbiddenError('D1 remote proxy forbidden', details);
      }
      if (resp.status === 429) {
        throw ErrorFactory.createSecurityError('D1 remote proxy rate limited', details);
      }
      if (resp.status >= 400 && resp.status < 500) {
        throw ErrorFactory.createValidationError('D1 remote proxy rejected request', details);
      }

      throw ErrorFactory.createConnectionError('D1 remote proxy error', {
        status: resp.status,
        details,
      });
    }

    return (await asJson(resp)) as T;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw ErrorFactory.createConnectionError('D1 remote proxy request timed out', {
        timeoutMs: settings.timeoutMs,
      });
    }
    throw error;
  }
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

const getExecChanges = (value: unknown): number => {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') return 0;
  const meta = value['meta'];
  if (!isRecord(meta) || typeof meta['changes'] !== 'number') return 0;
  return meta['changes'];
};

const queryRegistry = async (
  settings: D1RemoteSettings,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> => {
  const payload = await createStatementPayload(sql, parameters);
  const out = await requestJson<D1StatementResponse>(settings, '/zin/d1/statement', payload);

  if (isQueryResponse(out)) {
    return { rows: out.rows, rowCount: out.rowCount };
  }
  if (isQueryOneResponse(out)) {
    const row = out.row;
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  return { rows: [], rowCount: getExecChanges(out) };
};

const querySqlMode = async (
  settings: D1RemoteSettings,
  sql: string,
  parameters: unknown[]
): Promise<QueryResult> => {
  if (isMutatingSql(sql)) {
    const out = await requestJson<D1ExecResponse>(settings, '/zin/d1/exec', {
      sql,
      params: parameters,
    });
    return { rows: [], rowCount: getExecChanges(out) };
  }

  const out = await requestJson<D1QueryResponse>(settings, '/zin/d1/query', {
    sql,
    params: parameters,
  });
  return { rows: out.rows, rowCount: out.rowCount };
};

export const D1RemoteAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    const settings: D1RemoteSettings = {
      baseUrl: Env.get('D1_REMOTE_URL'),
      keyId: Env.get('D1_REMOTE_KEY_ID'),
      secret: Env.get('D1_REMOTE_SECRET'),
      mode: (Env.get('D1_REMOTE_MODE', 'registry') as D1RemoteMode) ?? 'registry',
      timeoutMs: Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT),
    };

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

        if (settings.mode === 'registry') {
          return queryRegistry(settings, sql, parameters);
        }

        return querySqlMode(settings, sql, parameters);
      },

      async queryOne(sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> {
        if (!connected) throw ErrorFactory.createConnectionError('Database not connected');

        if (settings.mode === 'registry') {
          const payload = await createStatementPayload(sql, parameters);
          const out = await requestJson<D1StatementResponse>(
            settings,
            '/zin/d1/statement',
            payload
          );
          if (isQueryOneResponse(out)) return out.row;
          if (isQueryResponse(out)) return out.rows[0] ?? null;
          return null;
        }

        const out = await requestJson<D1QueryOneResponse>(settings, '/zin/d1/queryOne', {
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

      getType(): string {
        return 'd1-remote';
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
