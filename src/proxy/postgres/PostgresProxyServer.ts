import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorHandler } from '@proxy/ErrorHandler';
import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { createProxyServer } from '@proxy/ProxyServer';
import {
  resolveBaseConfig,
  resolveBaseSigningConfig,
  verifyRequestSignature,
  type BaseProxyOverrides,
} from '@proxy/ProxyServerUtils';
import { RequestValidator } from '@proxy/RequestValidator';
import { validateSqlPayload } from '@proxy/SqlPayloadValidator';
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
};

type ProxyOverrides = BaseProxyOverrides &
  Partial<{
    dbHost: string;
    dbPort: number;
    dbName: string;
    dbUser: string;
    dbPass: string;
    connectionLimit: number;
  }>;

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
  const dbHost = overrides.dbHost ?? Env.DB_HOST ?? '127.0.0.1';
  const dbPort = overrides.dbPort ?? Env.DB_PORT_POSTGRESQL ?? 5432;
  const dbName = overrides.dbName ?? Env.DB_DATABASE_POSTGRESQL ?? 'postgres';
  const dbUser = overrides.dbUser ?? Env.DB_USERNAME_POSTGRESQL ?? 'postgres';
  const dbPass = overrides.dbPass ?? Env.DB_PASSWORD_POSTGRESQL ?? '';
  const connectionLimit = overrides.connectionLimit ?? Env.POSTGRES_PROXY_POOL_LIMIT;

  return { dbHost, dbPort, dbName, dbUser, dbPass, connectionLimit };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = resolveBaseConfig(overrides, 'POSTGRES');
  const dbConfig = resolveDatabaseConfig(overrides);
  const signingConfig = resolveBaseSigningConfig(overrides, 'POSTGRES');

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

  return ErrorHandler.toProxyError(404, 'NOT_FOUND', 'Unknown endpoint');
};

const createBackend = (pool: Pool): ProxyBackend => ({
  name: 'postgres',
  async handle(request): Promise<ProxyResponse> {
    const methodError = RequestValidator.requirePost(request.method);
    if (methodError) {
      return ErrorHandler.toProxyError(405, methodError.code, methodError.message);
    }

    const parsed = RequestValidator.parseJson(request.body);
    if (!parsed.ok) {
      return ErrorHandler.toProxyError(400, parsed.error.code, parsed.error.message);
    }

    const sqlValidation = validateSqlPayload(parsed.value);
    if (!sqlValidation.valid) {
      const error = sqlValidation.error ?? {
        code: 'VALIDATION_ERROR',
        message: 'Invalid SQL payload',
      };
      return ErrorHandler.toProxyError(400, error.code, error.message);
    }

    try {
      const sql = normalizeSql(sqlValidation.sql ?? '');
      const result = await pool.query(sql, sqlValidation.params ?? []);
      return handleEndpoint(request.path, {
        rows: (result.rows ?? []) as unknown[],
        rowCount: result.rowCount ?? result.rows?.length ?? 0,
      });
    } catch (error) {
      return ErrorHandler.toProxyError(500, 'POSTGRES_ERROR', String(error));
    }
  },
  async health(): Promise<ProxyResponse> {
    try {
      await pool.query('SELECT 1');
      return { status: 200, body: { status: 'healthy' } };
    } catch (error) {
      return ErrorHandler.toProxyError(503, 'UNHEALTHY', String(error));
    }
  },
});

export const PostgresProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);

    try {
      Logger.info(
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
    const backend = createBackend(pool);

    const proxy = createProxyServer({
      host: config.host,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
      backend,
      verify: async (req, body) => {
        const verified = await verifyRequestSignature(req, body, config, 'PostgresProxyServer');
        if (!verified.ok && verified.error) {
          return { ok: false, status: verified.error.status, message: verified.error.message };
        }
        return { ok: true };
      },
    });

    await proxy.start();

    Logger.info(`Postgres proxy listening on http://${config.host}:${config.port}`);
  },
});

export default PostgresProxyServer;
