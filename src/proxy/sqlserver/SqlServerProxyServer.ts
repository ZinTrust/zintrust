import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { type IncomingMessage } from '@node-singletons/http';
import { ErrorHandler } from '@proxy/ErrorHandler';
import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { createProxyServer } from '@proxy/ProxyServer';
import { RequestValidator } from '@proxy/RequestValidator';
import { normalizeSigningCredentials, SigningService } from '@proxy/SigningService';

type SqlServerPool = Record<string, unknown>;
type SqlServerResult = { recordset: unknown[]; rowsAffected: number[] };

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  poolConfig: Record<string, unknown>;
  signing: ProxySigningConfig;
};

type ProxyOverrides = Partial<{
  host: string;
  port: number;
  maxBodyBytes: number;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPass: string;
  connectionLimit: number;
  requireSigning: boolean;
  keyId: string;
  secret: string;
  signingWindowMs: number;
}>;

const normalizeHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value.join(',');
  return value;
};

const resolveProxyConfig = (
  overrides: ProxyOverrides = {}
): {
  host: string;
  port: number;
  maxBodyBytes: number;
} => {
  const host = overrides?.host ?? Env.get('SQLSERVER_PROXY_HOST', Env.HOST ?? '127.0.0.1');
  const port = overrides.port ?? Env.getInt('SQLSERVER_PROXY_PORT', Env.PORT ?? 3000);
  const maxBodyBytes =
    overrides.maxBodyBytes ?? Env.getInt('SQLSERVER_PROXY_MAX_BODY_BYTES', Env.MAX_BODY_SIZE ?? 0);

  return { host, port, maxBodyBytes };
};

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
  const dbHost = overrides.dbHost ?? Env.get('DB_HOST_MSSQL', Env.get('DB_HOST', '127.0.0.1'));
  const dbPort = overrides.dbPort ?? Env.getInt('DB_PORT_MSSQL', 1433);
  const dbName = overrides.dbName ?? Env.get('DB_DATABASE_MSSQL', 'zintrust');
  const dbUser = overrides.dbUser ?? Env.get('DB_USERNAME_MSSQL', 'sa');
  const dbPass = overrides.dbPass ?? Env.get('DB_PASSWORD_MSSQL', '');
  const connectionLimit = overrides.connectionLimit ?? Env.getInt('SQLSERVER_PROXY_POOL_LIMIT', 10);

  return { dbHost, dbPort, dbName, dbUser, dbPass, connectionLimit };
};

const resolveSigningConfig = (
  overrides: ProxyOverrides = {}
): {
  keyId: string;
  secret: string;
  requireSigning: boolean;
  signingWindowMs: number;
} => {
  const appName = Env.get('APP_NAME', Env.APP_NAME ?? 'ZinTrust');
  const appKey = Env.get('APP_KEY', Env.APP_KEY ?? '');
  const envKeyId = Env.get('SQLSERVER_PROXY_KEY_ID', appName);
  const envSecret = Env.get('SQLSERVER_PROXY_SECRET', appKey);
  const keyIdRaw = overrides.keyId ?? (envKeyId.trim() === '' ? appName : envKeyId);
  const secretRaw = overrides.secret ?? (envSecret.trim() === '' ? appKey : envSecret);
  const secret = secretRaw.trim() === '' ? appKey : secretRaw;
  const creds = normalizeSigningCredentials({ keyId: keyIdRaw, secret });
  const requireSigning =
    overrides.requireSigning ?? Env.getBool('SQLSERVER_PROXY_REQUIRE_SIGNING', true);
  const signingWindowMs =
    overrides.signingWindowMs ?? Env.getInt('SQLSERVER_PROXY_SIGNING_WINDOW_MS', 60000);

  return {
    keyId: creds.keyId,
    secret: creds.secret,
    requireSigning,
    signingWindowMs,
  };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = resolveProxyConfig(overrides);
  const dbConfig = resolveDatabaseConfig(overrides);
  const signingConfig = resolveSigningConfig(overrides);

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
  };
};

const verifySignatureIfNeeded = async (
  req: IncomingMessage,
  body: string,
  config: ProxyConfig
): Promise<{ ok: boolean; error?: { status: number; message: string } }> => {
  const headers: Record<string, string | undefined> = {
    'x-zt-key-id': normalizeHeaderValue(req.headers['x-zt-key-id']),
    'x-zt-timestamp': normalizeHeaderValue(req.headers['x-zt-timestamp']),
    'x-zt-nonce': normalizeHeaderValue(req.headers['x-zt-nonce']),
    'x-zt-body-sha256': normalizeHeaderValue(req.headers['x-zt-body-sha256']),
    'x-zt-signature': normalizeHeaderValue(req.headers['x-zt-signature']),
  };

  if (SigningService.shouldVerify(config.signing, headers)) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const verified = await SigningService.verify({
      method: req.method ?? 'POST',
      url,
      body,
      headers,
      signing: config.signing,
    });
    if (!verified.ok) {
      return { ok: false, error: { status: verified.status, message: verified.message } };
    }
  }

  return { ok: true };
};

const validateQueryPayload = (
  payload: Record<string, unknown>
): {
  valid: boolean;
  sql?: string;
  params?: unknown[];
  error?: { code: string; message: string };
} => {
  const sql = payload['sql'];
  const params = Array.isArray(payload['params']) ? payload['params'] : [];

  if (typeof sql !== 'string' || sql.trim() === '') {
    return { valid: false, error: { code: 'VALIDATION_ERROR', message: 'sql is required' } };
  }

  return { valid: true, sql, params };
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

  return ErrorHandler.toProxyError(404, 'NOT_FOUND', 'Unknown endpoint');
};

const createBackend = (pool: SqlServerPool): ProxyBackend => ({
  name: 'sqlserver',
  handle: async (request): Promise<ProxyResponse> => {
    const methodError = RequestValidator.requirePost(request.method);
    if (methodError) {
      return ErrorHandler.toProxyError(405, methodError.code, methodError.message);
    }

    const parsed = RequestValidator.parseJson(request.body);
    if (!parsed.ok) {
      return ErrorHandler.toProxyError(400, parsed.error.code, parsed.error.message);
    }

    const sqlValidation = validateQueryPayload(parsed.value);
    if (!sqlValidation.valid) {
      const error = sqlValidation.error ?? {
        code: 'VALIDATION_ERROR',
        message: 'Invalid SQL payload',
      };
      return ErrorHandler.toProxyError(400, error.code, error.message);
    }

    try {
      const result = await executeQuery(pool, sqlValidation.sql ?? '', sqlValidation.params ?? []);
      return handleEndpoint(request.path, result);
    } catch (error) {
      return ErrorHandler.toProxyError(500, 'SQLSERVER_ERROR', String(error));
    }
  },
  health: async (): Promise<ProxyResponse> => {
    try {
      await executeQuery(pool, 'SELECT 1', []);
      return { status: 200, body: { status: 'healthy' } };
    } catch (error) {
      return ErrorHandler.toProxyError(503, 'UNHEALTHY', String(error));
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
      Logger.info(
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
    const backend = createBackend(pool);

    const proxy = createProxyServer({
      host: config.host,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
      backend,
      verify: async (req, body) => {
        const verified = await verifySignatureIfNeeded(req, body, config);
        if (!verified.ok) {
          const error = verified.error ?? { status: 401, message: 'Unauthorized' };
          return { ok: false as const, status: error.status, message: error.message };
        }
        return { ok: true as const };
      },
    });

    await proxy.start();
    Logger.info(`✓ SQL Server proxy listening on ${config.host}:${config.port}`);
  },
});
