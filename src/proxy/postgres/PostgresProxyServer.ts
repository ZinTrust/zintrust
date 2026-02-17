import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { type BaseProxyOverrides } from '@proxy/ProxyServerUtils';
import type { SqlProxyDatabaseOverrides } from '@proxy/SqlProxyDbOverrides';
import * as Deps from '@proxy/SqlProxyServerDeps';
import { Pool } from 'pg';

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  poolOptions: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max: number;
  };
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
  const dbHost = overrides.dbHost ?? Deps.Env.DB_HOST ?? '127.0.0.1';
  const dbPort = overrides.dbPort ?? Deps.Env.DB_PORT_POSTGRESQL ?? 5432;
  const dbName = overrides.dbName ?? Deps.Env.DB_DATABASE_POSTGRESQL ?? 'postgres';
  const dbUser = overrides.dbUser ?? Deps.Env.DB_USERNAME_POSTGRESQL ?? 'postgres';
  const dbPass = overrides.dbPass ?? Deps.Env.DB_PASSWORD_POSTGRESQL ?? '';
  const connectionLimit = overrides.connectionLimit ?? Deps.Env.POSTGRES_PROXY_POOL_LIMIT;

  return { dbHost, dbPort, dbName, dbUser, dbPass, connectionLimit };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = Deps.resolveBaseConfig(overrides, 'POSTGRES');
  const dbConfig = resolveDatabaseConfig(overrides);
  const signingConfig = Deps.resolveBaseSigningConfig(overrides, 'POSTGRES');

  const poolOptions = {
    host: dbConfig.dbHost,
    port: dbConfig.dbPort,
    database: dbConfig.dbName,
    user: dbConfig.dbUser,
    password: dbConfig.dbPass,
    max: dbConfig.connectionLimit <= 0 ? 50 : dbConfig.connectionLimit,
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
    statements: Deps.loadStatementRegistry('POSTGRES'),
  };
};

const normalizeSql = (sql: string): string => {
  if (!sql.includes('?')) return sql;
  let index = 0;
  return sql.replaceAll('?', () => {
    index += 1;
    return `$${index}`;
  });
};

const handleEndpoint = (
  path: string,
  result: { rows: unknown[]; rowCount: number }
): ProxyResponse => {
  if (path === '/zin/postgres/query') {
    return { status: 200, body: { rows: result.rows, rowCount: result.rowCount } };
  }

  if (path === '/zin/postgres/queryOne') {
    const row = result.rows[0] ?? null;
    return { status: 200, body: { row } };
  }

  if (path === '/zin/postgres/exec') {
    return {
      status: 200,
      body: {
        ok: true,
        meta: { changes: result.rowCount },
      },
    };
  }

  if (path === '/zin/postgres/statement') {
    return { status: 200, body: { rows: result.rows, rowCount: result.rowCount } };
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
    const normalizedSql = normalizeSql(resolved.value.sql);
    const result = await params.pool.query(normalizedSql, resolved.value.params);
    const rows = (result.rows ?? []) as unknown[];
    const rowCount = result.rowCount ?? rows.length ?? 0;

    if (!resolved.value.mutating) {
      return handleEndpoint('/zin/postgres/statement', { rows, rowCount });
    }

    return {
      status: 200,
      body: {
        ok: true,
        meta: { changes: rowCount },
      },
    };
  } catch (error) {
    Deps.Logger.error('[PostgresProxyServer] Statement execution failed', {
      path: params.request.path,
      statementId: resolved.value.statementId,
      mutating: resolved.value.mutating,
      paramsCount: resolved.value.params.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return Deps.ErrorHandler.toProxyError(500, 'POSTGRES_ERROR', String(error));
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
    const sql = normalizeSql(sqlValidation.sql ?? '');
    const result = await params.pool.query(sql, sqlValidation.params ?? []);
    return handleEndpoint(params.request.path, {
      rows: (result.rows ?? []) as unknown[],
      rowCount: result.rowCount ?? result.rows?.length ?? 0,
    });
  } catch (error) {
    return Deps.ErrorHandler.toProxyError(500, 'POSTGRES_ERROR', String(error));
  }
};

const createBackend = (
  pool: Pool,
  statements: Record<string, string> | undefined
): ProxyBackend => ({
  name: 'postgres',
  async handle(request): Promise<ProxyResponse> {
    const validationError = Deps.validateProxyRequest(request);
    if (validationError !== null) return validationError;

    const parsed = Deps.parseJsonBody(request.body);
    if ('status' in parsed) return parsed;

    if (request.path === '/zin/postgres/statement') {
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
      return Deps.ErrorHandler.toProxyError(503, 'UNHEALTHY', String(error));
    }
  },
});

export const PostgresProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);

    try {
      Deps.Logger.info(
        `Postgres proxy config: proxyHost=${config.host} proxyPort=${config.port} dbHost=${String(
          config.poolOptions.host
        )} dbPort=${String(config.poolOptions.port)} dbName=${String(
          config.poolOptions.database
        )} dbUser=${String(config.poolOptions.user)}`
      );
    } catch {
      // noop - logging must not block startup
    }

    const pool = new Pool(config.poolOptions);
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
          'PostgresProxyServer'
        );
        if (!verified.ok && verified.error) {
          return { ok: false, status: verified.error.status, message: verified.error.message };
        }
        return { ok: true };
      },
    });

    await proxy.start();

    Deps.Logger.info(`Postgres proxy listening on http://${config.host}:${config.port}`);
  },
});

export default PostgresProxyServer;
