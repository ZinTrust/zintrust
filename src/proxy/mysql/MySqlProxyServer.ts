import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { type IncomingMessage } from '@node-singletons/http';
import { ErrorHandler } from '@proxy/ErrorHandler';
import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { createProxyServer } from '@proxy/ProxyServer';
import { RequestValidator } from '@proxy/RequestValidator';
import { normalizeSigningCredentials, SigningService } from '@proxy/SigningService';
import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  poolOptions: PoolOptions;
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
  const host = overrides?.host ?? Env.MYSQL_PROXY_HOST ?? Env.HOST ?? '127.0.0.1';
  const port = overrides.port ?? Env.MYSQL_PROXY_PORT ?? Env.PORT;
  const maxBodyBytes =
    overrides.maxBodyBytes ?? Env.MYSQL_PROXY_MAX_BODY_BYTES ?? Env.MAX_BODY_SIZE;

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
  const dbHost = overrides.dbHost ?? Env.get('DB_HOST', '127.0.0.1');
  const dbPort = overrides.dbPort ?? Env.getInt('DB_PORT', 3306);
  const dbName = overrides.dbName ?? Env.get('DB_DATABASE', 'zintrust');
  const dbUser = overrides.dbUser ?? Env.get('DB_USERNAME', 'root');
  const dbPass = overrides.dbPass ?? Env.get('DB_PASSWORD', 'pass');
  const connectionLimit = overrides.connectionLimit ?? Env.MYSQL_PROXY_POOL_LIMIT;

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
  const envKeyId = Env.get('MYSQL_PROXY_KEY_ID', appName);
  const envSecret = Env.get('MYSQL_PROXY_SECRET', appKey);
  const keyIdRaw = overrides.keyId ?? (envKeyId.trim() === '' ? appName : envKeyId);
  const secretRaw = overrides.secret ?? (envSecret.trim() === '' ? appKey : envSecret);
  const secret = secretRaw.trim() === '' ? appKey : secretRaw;
  const creds = normalizeSigningCredentials({ keyId: keyIdRaw, secret });
  const requireSigning =
    overrides.requireSigning ?? Env.getBool('MYSQL_PROXY_REQUIRE_SIGNING', true);
  const signingWindowMs =
    overrides.signingWindowMs ?? Env.getInt('MYSQL_PROXY_SIGNING_WINDOW_MS', 60000);

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

  const hasAnySigningHeader = Object.values(headers).some(
    (value) => typeof value === 'string' && value.trim() !== ''
  );

  Logger.debug('[MySQLProxyServer] Verifying request signature', {
    path: req.url ?? '',
    method: req.method ?? 'POST',
    requireSigning: config.signing.require,
    hasAnySigningHeader,
    configuredKeyId: config.signing.keyId,
    hasConfiguredSecret: config.signing.secret.trim() !== '',
    bodyBytes: body.length,
  });

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
      Logger.warn('[MySQLProxyServer] Signature verification failed', {
        path: req.url ?? '',
        method: req.method ?? 'POST',
        status: verified.status,
        message: verified.message,
      });
      return { ok: false, error: { status: verified.status, message: verified.message } };
    }
  }

  return { ok: true };
};

const validateSqlPayload = (
  payload: Record<string, unknown>
): {
  valid: boolean;
  sql?: string;
  params?: unknown[];
  error?: { code: string; message: string };
} => {
  const sql = payload['sql'];
  const params = Array.isArray(payload['params']) ? payload['params'] : [];

  if (typeof sql !== 'string') {
    return { valid: false, error: { code: 'VALIDATION_ERROR', message: 'sql must be a string' } };
  }

  return { valid: true, sql, params };
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

  return ErrorHandler.toProxyError(404, 'NOT_FOUND', 'Unknown endpoint');
};

const createBackend = (pool: Pool): ProxyBackend => ({
  name: 'mysql',
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
      const [rows] = await pool.query(sqlValidation.sql ?? '', sqlValidation.params ?? []);
      return handleEndpoint(request.path, rows);
    } catch (error) {
      Logger.error('[MySQLProxyServer] Query execution failed', {
        path: request.path,
        sqlPreview: String(sqlValidation.sql ?? '').slice(0, 160),
        paramsCount: Array.isArray(sqlValidation.params) ? sqlValidation.params.length : 0,
        error: error instanceof Error ? error.message : String(error),
      });
      return ErrorHandler.toProxyError(500, 'MYSQL_ERROR', String(error));
    }
  },
  async health(): Promise<ProxyResponse> {
    try {
      await pool.query('SELECT 1');
      return { status: 200, body: { status: 'healthy' } };
    } catch (error) {
      Logger.error('[MySQLProxyServer] Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return ErrorHandler.toProxyError(503, 'UNHEALTHY', String(error));
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
      Logger.info(
        `MySQL proxy config: proxyHost=${config.host} proxyPort=${config.port} dbHost=${String(config.poolOptions.host)} dbPort=${String(config.poolOptions.port)} dbName=${String(config.poolOptions.database)} dbUser=${String(config.poolOptions.user)} requireSigning=${String(config.signing.require)} keyId=${config.signing.keyId} hasSecret=${String(config.signing.secret.trim() !== '')} signingWindowMs=${String(config.signing.windowMs)}`
      );
    } catch {
      // noop - logging must not block startup
    }

    const pool = createPool(config.poolOptions);
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
          return { ok: false, status: error.status, message: error.message };
        }
        return { ok: true };
      },
    });

    await proxy.start();

    Logger.info(`MySQL proxy listening on http://${config.host}:${config.port}`);
  },
});

export default MySqlProxyServer;
