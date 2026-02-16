import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { type BaseProxyOverrides } from '@proxy/ProxyServerUtils';
import type { SqlProxyDatabaseConfig, SqlProxyDatabaseOverrides } from '@proxy/SqlProxyDbOverrides';
import * as Deps from '@proxy/SqlProxyServerDeps';

type SqlServerPool = Record<string, unknown>;
type SqlServerResult = { recordset: unknown[]; rowsAffected: number[] };

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  poolConfig: Record<string, unknown>;
  signing: ProxySigningConfig;
  statements?: Record<string, string>;
};

type ProxyOverrides = BaseProxyOverrides & SqlProxyDatabaseOverrides;

const resolveDatabaseConfig = (overrides: ProxyOverrides = {}): SqlProxyDatabaseConfig => {
  const dbHost =
    overrides.dbHost ?? Deps.Env.get('DB_HOST_MSSQL', Deps.Env.get('DB_HOST', '127.0.0.1'));
  const dbPort = overrides.dbPort ?? Deps.Env.getInt('DB_PORT_MSSQL', 1433);
  const dbName = overrides.dbName ?? Deps.Env.get('DB_DATABASE_MSSQL', 'zintrust');
  const dbUser = overrides.dbUser ?? Deps.Env.get('DB_USERNAME_MSSQL', 'sa');
  const dbPass = overrides.dbPass ?? Deps.Env.get('DB_PASSWORD_MSSQL', '');
  const connectionLimit =
    overrides.connectionLimit ?? Deps.Env.getInt('SQLSERVER_PROXY_POOL_LIMIT', 10);

  return { dbHost, dbPort, dbName, dbUser, dbPass, connectionLimit };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = Deps.resolveBaseConfig(overrides, 'SQLSERVER');
  const dbConfig = resolveDatabaseConfig(overrides);
  const signingConfig = Deps.resolveBaseSigningConfig(overrides, 'SQLSERVER');

  const poolConfig = {
    server: dbConfig.dbHost,
    port: dbConfig.dbPort,
    database: dbConfig.dbName,
    user: dbConfig.dbUser,
    password: dbConfig.dbPass,
    pool: {
      max: dbConfig.connectionLimit,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };

  return {
    host: proxyConfig.host,
    port: proxyConfig.port,
    maxBodyBytes: proxyConfig.maxBodyBytes,
    poolConfig,
    signing: {
      keyId: signingConfig.keyId,
      secret: signingConfig.secret,
      require: signingConfig.requireSigning,
      windowMs: signingConfig.signingWindowMs,
    },
    statements: Deps.loadStatementRegistry('SQLSERVER'),
  };
};

const validateQueryPayload = (
  payload: Record<string, unknown>
): {
  valid: boolean;
  sql?: string;
  params?: unknown[];
  error?: { code: string; message: string };
} => {
  const base = Deps.validateSqlPayload(payload);
  if (!base.valid) {
    return { valid: false, error: base.error };
  }

  if (base.sql.trim() === '') {
    return { valid: false, error: { code: 'VALIDATION_ERROR', message: 'sql is required' } };
  }

  return { valid: true, sql: base.sql, params: base.params };
};

const getSqlModule = async (): Promise<Record<string, unknown>> => {
  const mod = await import('mssql');
  return mod as unknown as Record<string, unknown>;
};

const createPool = async (config: Record<string, unknown>): Promise<SqlServerPool> => {
  const mod = await getSqlModule();
  const connect = mod['connect'] as (config: Record<string, unknown>) => Promise<SqlServerPool>;
  return connect(config);
};

const executeQuery = async (
  pool: SqlServerPool,
  sqlQuery: string,
  params: unknown[]
): Promise<SqlServerResult> => {
  const requestFunc = pool['request'] as () => Record<string, unknown>;
  const request = requestFunc();

  params.forEach((param, index) => {
    const inputFunc = request['input'] as (name: string, value: unknown) => void;
    inputFunc(`param${index}`, param);
  });

  const queryFunc = request['query'] as (sql: string) => Promise<SqlServerResult>;
  return queryFunc(sqlQuery);
};

const handleEndpoint = (path: string, result: SqlServerResult): ProxyResponse => {
  const rows = result['recordset'];
  const rowsAffected = result['rowsAffected'];

  if (path === '/zin/sqlserver/query') {
    return { status: 200, body: { rows, rowCount: rowsAffected[0] ?? 0 } };
  }

  if (path === '/zin/sqlserver/queryOne') {
    const firstRow = Array.isArray(rows) ? rows[0] : null;
    return { status: 200, body: { row: firstRow ?? null } };
  }

  if (path === '/zin/sqlserver/exec') {
    return {
      status: 200,
      body: {
        ok: true,
        meta: { changes: rowsAffected[0] ?? 0 },
      },
    };
  }

  if (path === '/zin/sqlserver/statement') {
    // Statement endpoint returns query-shaped response for non-mutating SQL.
    return { status: 200, body: { rows, rowCount: rowsAffected[0] ?? 0 } };
  }

  return Deps.ErrorHandler.toProxyError(404, 'NOT_FOUND', 'Unknown endpoint');
};

const toMutatingStatementResponse = (result: SqlServerResult): ProxyResponse => {
  const rowsAffected = result['rowsAffected'];
  return {
    status: 200,
    body: {
      ok: true,
      meta: { changes: rowsAffected[0] ?? 0 },
    },
  };
};

const handleStatementRequest = async (
  pool: SqlServerPool,
  statements: Record<string, string> | undefined,
  requestPath: string,
  payload: Record<string, unknown>
): Promise<ProxyResponse> => {
  const resolved = Deps.resolveStatementOrError(statements, payload);
  if (!resolved.ok) return resolved.response;

  try {
    const result = await executeQuery(pool, resolved.value.sql, resolved.value.params);
    if (!resolved.value.mutating) return handleEndpoint('/zin/sqlserver/statement', result);
    return toMutatingStatementResponse(result);
  } catch (error) {
    Deps.Logger.error('[SqlServerProxyServer] Statement execution failed', {
      path: requestPath,
      statementId: resolved.value.statementId,
      mutating: resolved.value.mutating,
      paramsCount: resolved.value.params.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return Deps.ErrorHandler.toProxyError(500, 'SQLSERVER_ERROR', String(error));
  }
};

const handleSqlRequest = async (
  pool: SqlServerPool,
  requestPath: string,
  payload: Record<string, unknown>
): Promise<ProxyResponse> => {
  const sqlValidation = validateQueryPayload(payload);
  if (!sqlValidation.valid) {
    const error = sqlValidation.error ?? {
      code: 'VALIDATION_ERROR',
      message: 'Invalid SQL payload',
    };
    return Deps.ErrorHandler.toProxyError(400, error.code, error.message);
  }

  try {
    const result = await executeQuery(pool, sqlValidation.sql ?? '', sqlValidation.params ?? []);
    return handleEndpoint(requestPath, result);
  } catch (error) {
    return Deps.ErrorHandler.toProxyError(500, 'SQLSERVER_ERROR', String(error));
  }
};

const handleProxyRequest = async (
  pool: SqlServerPool,
  statements: Record<string, string> | undefined,
  request: { method: string; path: string; body: string }
): Promise<ProxyResponse> => {
  const validationError = Deps.validateProxyRequest(request);
  if (validationError !== null) return validationError;

  const parsed = Deps.parseJsonBody(request.body);
  if ('status' in parsed) return parsed;

  if (request.path === '/zin/sqlserver/statement') {
    return handleStatementRequest(pool, statements, request.path, parsed.value);
  }

  return handleSqlRequest(pool, request.path, parsed.value);
};

const createBackend = (
  pool: SqlServerPool,
  statements: Record<string, string> | undefined
): ProxyBackend => ({
  name: 'sqlserver',
  handle: async (request): Promise<ProxyResponse> => handleProxyRequest(pool, statements, request),
  health: async (): Promise<ProxyResponse> => {
    try {
      await executeQuery(pool, 'SELECT 1', []);
      return { status: 200, body: { status: 'healthy' } };
    } catch (error) {
      return Deps.ErrorHandler.toProxyError(503, 'UNHEALTHY', String(error));
    }
  },
  shutdown: async (): Promise<void> => {
    const closeFunc = pool['close'] as () => Promise<void>;
    await closeFunc();
  },
});

export const SqlServerProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);

    try {
      Deps.Logger.info(
        `SQL Server proxy config: proxyHost=${config.host} proxyPort=${config.port} dbHost=${String(
          config.poolConfig['server']
        )} dbPort=${String(config.poolConfig['port'])} dbName=${String(
          config.poolConfig['database']
        )} dbUser=${String(config.poolConfig['user'])}`
      );
    } catch {
      // noop - logging must not block startup
    }

    const pool = await createPool(config.poolConfig);
    const backend = createBackend(pool, config.statements);

    const proxy = Deps.createProxyServer({
      host: config.host,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
      backend,
      verify: async (req, body) => {
        const verified = await Deps.verifyRequestSignature(
          req,
          body,
          config,
          'SqlServerProxyServer'
        );
        if (!verified.ok && verified.error) {
          return { ok: false, status: verified.error.status, message: verified.error.message };
        }
        return { ok: true };
      },
    });

    await proxy.start();
    Deps.Logger.info(`✓ SQL Server proxy listening on ${config.host}:${config.port}`);
  },
});
