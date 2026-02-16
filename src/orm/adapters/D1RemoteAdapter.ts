/**
 * D1 Remote Database Adapter
 *
 * Calls a ZinTrust Cloudflare Worker proxy over HTTPS.
 */

import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { AdaptersEnum, type SupportedDriver } from '@migrations/enum';
import { isRecord } from '@orm/adapters/SqlProxyAdapterUtils';
import { createStatementId } from '@orm/adapters/SqlProxyRegistryMode';
import type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';
import { SchemaWriter } from '@orm/SchemaStatemenWriter';
import { isMutatingSql } from '@proxy/isMutatingSql';

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

let warnedFallbackCredentials = false;

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
  const directKeyId = Env.get('D1_REMOTE_KEY_ID', '').trim();
  const directSecret = Env.get('D1_REMOTE_SECRET', '').trim();

  // Intentionally pass empty values when missing so RemoteSignedJson's credential normalizer
  // derives the fallback keyId/secret (APP_NAME/APP_KEY) in a consistent, safe way.
  const keyId = directKeyId === '' ? '' : directKeyId;
  const secret = directSecret === '' ? '' : directSecret;

  if (directKeyId === '' || directSecret === '') {
    if (!warnedFallbackCredentials) {
      warnedFallbackCredentials = true;
      Logger.warn(
        'D1_REMOTE_KEY_ID / D1_REMOTE_SECRET missing; using fallback signing credentials (APP_NAME / APP_KEY).'
      );
    }
  }

  const envName = (Env.get('NODE_ENV', 'development') || 'development').trim().toLowerCase();
  const defaultMode: D1RemoteMode = envName === 'production' ? 'registry' : 'sql';

  const settings: D1RemoteSettings = {
    baseUrl: Env.get('D1_REMOTE_URL'),
    keyId,
    secret,
    mode: (Env.get('D1_REMOTE_MODE', defaultMode) as D1RemoteMode) ?? defaultMode,
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
      'D1 remote signing credentials are missing (D1_REMOTE_KEY_ID / D1_REMOTE_SECRET). Fallbacks: APP_NAME and APP_KEY.',
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

const createStatementPayload = async (
  sql: string,
  parameters: unknown[]
): Promise<Record<string, unknown>> => {
  const statementId = await createStatementId(sql);
  await SchemaWriter(sql);
  return { statementId, params: parameters };
};

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
  await SchemaWriter(sql);
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

type ConnectedGetter = () => boolean;
type ConnectedSetter = (value: boolean) => void;

const requireConnected = (getConnected: ConnectedGetter): void => {
  if (!getConnected()) throw ErrorFactory.createConnectionError('Database not connected');
};

const createConnectMethod = (setConnected: ConnectedSetter) => async (): Promise<void> => {
  setConnected(true);
  return Promise.resolve(); // NOSONAR
};

const createDisconnectMethod = (setConnected: ConnectedSetter) => async (): Promise<void> => {
  setConnected(false);
  return Promise.resolve(); // NOSONAR
};

const createQueryMethod =
  (getConnected: ConnectedGetter, mode: D1RemoteMode, remote: RemoteSignedJsonSettings) =>
  async (sql: string, parameters: unknown[]): Promise<QueryResult> => {
    requireConnected(getConnected);

    if (mode === 'registry') {
      return queryRegistry(remote, sql, parameters);
    }

    return querySqlMode(remote, sql, parameters);
  };

const createQueryOneMethod =
  (getConnected: ConnectedGetter, mode: D1RemoteMode, remote: RemoteSignedJsonSettings) =>
  async (sql: string, parameters: unknown[]): Promise<Record<string, unknown> | null> => {
    requireConnected(getConnected);

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

    await SchemaWriter(sql);
    const out = await RemoteSignedJson.request<D1QueryOneResponse>(remote, '/zin/d1/queryOne', {
      sql,
      params: parameters,
    });
    return out.row;
  };

const createPingMethod =
  (getConnected: ConnectedGetter, methods: IDatabaseAdapter) => async (): Promise<void> => {
    requireConnected(getConnected);
    const sql = QueryBuilder.create('').select('1').toSQL();
    await methods.queryOne(sql, []);
  };

const createTransactionMethod =
  (getConnected: ConnectedGetter, methods: IDatabaseAdapter) =>
  async <T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> => {
    requireConnected(getConnected);
    try {
      return await callback(methods);
    } catch (error: unknown) {
      throw ErrorFactory.createTryCatchError('Transaction failed', error);
    }
  };

const createEnsureMigrationsTableMethod =
  (getConnected: ConnectedGetter, methods: IDatabaseAdapter) => async (): Promise<void> => {
    requireConnected(getConnected);

    // D1 is SQLite under the hood; this schema matches the core migrator's expectations.
    // Note: d1-remote migrations are expected to run in SQL mode (the CLI enforces this).
    await methods.query(
      `CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        service TEXT NOT NULL DEFAULT '',
        batch INTEGER NOT NULL,
        status TEXT NOT NULL,
        applied_at TEXT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(name, scope, service)
      )`,
      []
    );
  };

const createRawQueryMethod =
  (methods: IDatabaseAdapter) =>
  async <T = unknown>(sql: string, parameters: unknown[] = []): Promise<T[]> => {
    const out = await methods.query(sql, parameters);
    return out.rows as T[];
  };

const createAdapterMethods = (
  getConnected: ConnectedGetter,
  setConnected: ConnectedSetter,
  mode: D1RemoteMode,
  remote: RemoteSignedJsonSettings
): IDatabaseAdapter => {
  const methods = {} as IDatabaseAdapter;

  methods.connect = createConnectMethod(setConnected);
  methods.disconnect = createDisconnectMethod(setConnected);

  methods.query = createQueryMethod(getConnected, mode, remote);
  methods.queryOne = createQueryOneMethod(getConnected, mode, remote);

  methods.ping = createPingMethod(getConnected, methods);
  methods.transaction = createTransactionMethod(getConnected, methods);
  methods.ensureMigrationsTable = createEnsureMigrationsTableMethod(getConnected, methods);
  methods.rawQuery = createRawQueryMethod(methods);

  methods.getType = (): SupportedDriver => AdaptersEnum.d1Remote;
  methods.isConnected = (): boolean => getConnected();
  methods.getPlaceholder = (_index: number): string => '?';

  return methods;
};

const createAdapter = (
  getConnected: ConnectedGetter,
  setConnected: ConnectedSetter,
  mode: D1RemoteMode,
  remote: RemoteSignedJsonSettings
): IDatabaseAdapter => createAdapterMethods(getConnected, setConnected, mode, remote);

export const D1RemoteAdapter = Object.freeze({
  create(_config: DatabaseConfig): IDatabaseAdapter {
    let connected = false;

    const { mode, remote } = createRemoteConfig();

    const getConnected = (): boolean => connected;

    return createAdapter(
      getConnected,
      (value) => {
        connected = value;
      },
      mode,
      remote
    );
  },
});

export default D1RemoteAdapter;
