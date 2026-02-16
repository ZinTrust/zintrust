import { ErrorFactory } from '@exceptions/ZintrustError';
import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { type BaseProxyOverrides } from '@proxy/ProxyServerUtils';
import type { SqlProxyDatabaseOverrides } from '@proxy/SqlProxyDbOverrides';
import * as Deps from '@proxy/SqlProxyServerDeps';
import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  poolOptions: PoolOptions;
  signing: ProxySigningConfig;
  statements?: Record<string, string>;
};

type ProxyOverrides = BaseProxyOverrides & SqlProxyDatabaseOverrides;

const resolveDatabaseConfig = (
  overrides: ProxyOverrides = {}
): {
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPass: string;
  connectionLimit: number;
} => {
  const dbHost =
    overrides.dbHost ?? Deps.Env.get('MYSQL_DB_HOST', Deps.Env.get('DB_HOST', '127.0.0.1'));
  const dbPort =
    overrides.dbPort ?? Deps.Env.getInt('MYSQL_DB_PORT', Deps.Env.getInt('DB_PORT', 3306));
  const dbName =
    overrides.dbName ?? Deps.Env.get('MYSQL_DB_DATABASE', Deps.Env.get('DB_DATABASE', 'zintrust'));
  const dbUser =
    overrides.dbUser ?? Deps.Env.get('MYSQL_DB_USERNAME', Deps.Env.get('DB_USERNAME', 'root'));
  const dbPass =
    overrides.dbPass ?? Deps.Env.get('MYSQL_DB_PASSWORD', Deps.Env.get('DB_PASSWORD', 'pass'));
  const connectionLimit = overrides.connectionLimit ?? Deps.Env.MYSQL_PROXY_POOL_LIMIT;

  return { dbHost, dbPort, dbName, dbUser, dbPass, connectionLimit };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = Deps.resolveBaseConfig(overrides, 'MYSQL');
  const dbConfig = resolveDatabaseConfig(overrides);
  const signingConfig = Deps.resolveBaseSigningConfig(overrides, 'MYSQL');

  const poolOptions: PoolOptions = {
    host: dbConfig.dbHost,
    port: dbConfig.dbPort,
    database: dbConfig.dbName,
    user: dbConfig.dbUser,
    password: dbConfig.dbPass,
    waitForConnections: true,
    connectionLimit: dbConfig.connectionLimit <= 0 ? 50 : dbConfig.connectionLimit,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    namedPlaceholders: true,
  };

  return {
    host: proxyConfig.host,
    port: proxyConfig.port,
    maxBodyBytes: proxyConfig.maxBodyBytes,
    poolOptions,
    signing: {
      keyId: signingConfig.keyId,
      secret: signingConfig.secret,
      require: signingConfig.requireSigning,
      windowMs: signingConfig.signingWindowMs,
    },
    statements: Deps.loadStatementRegistry('MYSQL'),
  };
};

const normalizeResult = (
  rows: unknown
): {
  rows: Record<string, unknown>[];
  rowCount: number;
  lastInsertId?: number | string | bigint;
} => {
  if (Array.isArray(rows)) {
    return { rows: rows as Record<string, unknown>[], rowCount: rows.length };
  }
  if (rows !== null && rows !== undefined && typeof rows === 'object') {
    const input = rows as { affectedRows?: number; insertId?: number | string | bigint };
    const affectedRows = Number.isFinite(input.affectedRows) ? Number(input.affectedRows) : 0;
    const insertId = input.insertId;
    const lastInsertId =
      typeof insertId === 'number' || typeof insertId === 'string' || typeof insertId === 'bigint'
        ? insertId
        : undefined;
    return { rows: [], rowCount: affectedRows, lastInsertId };
  }
  return { rows: [], rowCount: 0 };
};

const handleEndpoint = (path: string, rows: unknown): ProxyResponse => {
  if (path === '/zin/mysql/query') {
    return { status: 200, body: normalizeResult(rows) };
  }

  if (path === '/zin/mysql/queryOne') {
    if (Array.isArray(rows)) {
      return { status: 200, body: { row: (rows[0] as unknown) ?? null } };
    }
    return { status: 200, body: { row: null } };
  }

  if (path === '/zin/mysql/exec') {
    const normalized = normalizeResult(rows);
    return {
      status: 200,
      body: {
        ok: true,
        meta: { changes: normalized.rowCount, lastRowId: normalized.lastInsertId },
      },
    };
  }

  return Deps.ErrorHandler.toProxyError(404, 'NOT_FOUND', 'Unknown endpoint');
};

const handleStatementRequest = async (params: {
  pool: Pool;
  statements: Record<string, string> | undefined;
  request: { path: string };
  payload: Record<string, unknown>;
}): Promise<ProxyResponse> => {
  const resolved = Deps.resolveStatementOrError(params.statements, params.payload);
  if (!resolved.ok) return resolved.response;

  try {
    const [rows] = await params.pool.query(resolved.value.sql, resolved.value.params);

    const normalized = normalizeResult(rows);
    if (!resolved.value.mutating) {
      return { status: 200, body: { rows: normalized.rows, rowCount: normalized.rowCount } };
    }

    return {
      status: 200,
      body: {
        ok: true,
        meta: { changes: normalized.rowCount, lastRowId: normalized.lastInsertId },
      },
    };
  } catch (error) {
    Deps.Logger.error('[MySQLProxyServer] Statement execution failed', {
      path: params.request.path,
      statementId: resolved.value.statementId,
      mutating: resolved.value.mutating,
      paramsCount: resolved.value.params.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return Deps.ErrorHandler.toProxyError(500, 'MYSQL_ERROR', String(error));
  }
};

const handleSqlRequest = async (params: {
  pool: Pool;
  request: { path: string };
  payload: Record<string, unknown>;
}): Promise<ProxyResponse> => {
  const sqlValidation = Deps.validateSqlPayload(params.payload);
  if (!sqlValidation.valid) {
    const error = sqlValidation.error ?? {
      code: 'VALIDATION_ERROR',
      message: 'Invalid SQL payload',
    };
    return Deps.ErrorHandler.toProxyError(400, error.code, error.message);
  }

  try {
    const [rows] = await params.pool.query(sqlValidation.sql ?? '', sqlValidation.params ?? []);
    return handleEndpoint(params.request.path, rows);
  } catch (error) {
    Deps.Logger.error('[MySQLProxyServer] Query execution failed', {
      path: params.request.path,
      sqlPreview: String(sqlValidation.sql ?? '').slice(0, 160),
      paramsCount: Array.isArray(sqlValidation.params) ? sqlValidation.params.length : 0,
      error: error instanceof Error ? error.message : String(error),
    });
    return Deps.ErrorHandler.toProxyError(500, 'MYSQL_ERROR', String(error));
  }
};

const createBackend = (
  pool: Pool,
  statements: Record<string, string> | undefined
): ProxyBackend => ({
  name: 'mysql',
  async handle(request): Promise<ProxyResponse> {
    const validationError = Deps.validateProxyRequest(request);
    if (validationError !== null) return validationError;

    const parsed = Deps.parseJsonBody(request.body);
    if ('status' in parsed) return parsed;

    if (request.path === '/zin/mysql/statement') {
      return handleStatementRequest({
        pool,
        statements,
        request,
        payload: parsed.value,
      });
    }

    return handleSqlRequest({ pool, request, payload: parsed.value });
  },
  async health(): Promise<ProxyResponse> {
    try {
      await pool.query('SELECT 1');
      return { status: 200, body: { status: 'healthy' } };
    } catch (error) {
      Deps.Logger.error('[MySQLProxyServer] Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return Deps.ErrorHandler.toProxyError(503, 'UNHEALTHY', String(error));
    }
  },
});

export const MySqlProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);
    const signingHasKeyId = config.signing.keyId.trim() !== '';
    const signingHasSecret = config.signing.secret.trim() !== '';

    if (config.signing.require && (!signingHasKeyId || !signingHasSecret)) {
      throw ErrorFactory.createConfigError(
        `MySQL proxy signing is required but credentials are missing. ` +
          `Set MYSQL_PROXY_KEY_ID and MYSQL_PROXY_SECRET (fallbacks: APP_NAME and APP_KEY). ` +
          `Resolved state: keyId=${config.signing.keyId || '<empty>'}, hasSecret=${String(signingHasSecret)}, ` +
          `cwd=${typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '<unknown>'}`
      );
    }

    // Debug: surface resolved config so we can compare watch vs non-watch runs
    try {
      Deps.Logger.info(
        `MySQL proxy config: proxyHost=${config.host} proxyPort=${config.port} dbHost=${String(config.poolOptions.host)} dbPort=${String(config.poolOptions.port)} dbName=${String(config.poolOptions.database)} dbUser=${String(config.poolOptions.user)} requireSigning=${String(config.signing.require)} keyId=${config.signing.keyId} hasSecret=${String(config.signing.secret.trim() !== '')} signingWindowMs=${String(config.signing.windowMs)}`
      );
    } catch {
      // noop - logging must not block startup
    }

    const pool = createPool(config.poolOptions);
    const backend = createBackend(pool, config.statements);

    const proxy = Deps.createProxyServer({
      host: config.host,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
      backend,
      verify: async (req, body) => {
        const verified = await Deps.verifyRequestSignature(req, body, config, 'MySQLProxyServer');
        if (!verified.ok && verified.error) {
          return { ok: false, status: verified.error.status, message: verified.error.message };
        }
        return { ok: true };
      },
    });

    await proxy.start();

    Deps.Logger.info(`MySQL proxy listening on http://${config.host}:${config.port}`);
  },
});

export default MySqlProxyServer;
