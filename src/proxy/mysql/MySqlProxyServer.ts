import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { createServer, type IncomingMessage, type ServerResponse } from '@node-singletons/http';
import { SignedRequest } from '@security/SignedRequest';
import { createPool, type Pool, type PoolOptions } from 'mysql2/promise';

type SigningConfig = {
  keyId: string;
  secret: string;
  require: boolean;
  windowMs: number;
};

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  poolOptions: PoolOptions;
  signing: SigningConfig;
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
  const host = overrides?.host ?? Env.MYSQL_PROXY_HOST ?? '127.0.0.1';
  const port = overrides.port ?? Env.MYSQL_PROXY_PORT;
  const maxBodyBytes = overrides.maxBodyBytes ?? Env.MYSQL_PROXY_MAX_BODY_BYTES;

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
  const keyId = overrides.keyId ?? Env.MYSQL_PROXY_KEY_ID;
  const secret = overrides.secret ?? Env.MYSQL_PROXY_SECRET;
  const requireSigning = overrides.requireSigning ?? Env.MYSQL_PROXY_REQUIRE_SIGNING;
  const signingWindowMs = overrides.signingWindowMs ?? Env.MYSQL_PROXY_SIGNING_WINDOW_MS;

  return { keyId, secret, requireSigning, signingWindowMs };
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

const readBody = async (req: IncomingMessage, maxBodyBytes: number): Promise<string> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : (Buffer.from(chunk) as Buffer<ArrayBufferLike>);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw ErrorFactory.createValidationError('Body too large');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
};

const respondJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
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

const shouldVerifySignature = (
  signing: SigningConfig,
  headers: Record<string, string | undefined>
): boolean => {
  const hasSigningHeader = Boolean(
    (headers['x-zt-key-id'] ?? '') ||
    (headers['x-zt-timestamp'] ?? '') ||
    (headers['x-zt-nonce'] ?? '') ||
    (headers['x-zt-body-sha256'] ?? '') ||
    headers['x-zt-signature']
  );

  if (signing.require) return true;
  if (signing.keyId.trim() !== '' && signing.secret.trim() !== '' && hasSigningHeader) return true;

  return false;
};

const verifyRequestSignature = async (
  req: IncomingMessage,
  body: string,
  signing: SigningConfig
): Promise<{ ok: true } | { ok: false; status: number; message: string }> => {
  if (signing.require && (signing.keyId.trim() === '' || signing.secret.trim() === '')) {
    return { ok: false, status: 500, message: 'Proxy signing is required but not configured' };
  }

  const headers: Record<string, string | undefined> = {
    'x-zt-key-id': normalizeHeaderValue(req.headers['x-zt-key-id']),
    'x-zt-timestamp': normalizeHeaderValue(req.headers['x-zt-timestamp']),
    'x-zt-nonce': normalizeHeaderValue(req.headers['x-zt-nonce']),
    'x-zt-body-sha256': normalizeHeaderValue(req.headers['x-zt-body-sha256']),
    'x-zt-signature': normalizeHeaderValue(req.headers['x-zt-signature']),
  };

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const result = await SignedRequest.verify({
    method: req.method ?? 'POST',
    url,
    body,
    headers,
    // eslint-disable-next-line @typescript-eslint/require-await
    getSecretForKeyId: async (keyId: string) =>
      keyId === signing.keyId ? signing.secret : undefined,
    windowMs: signing.windowMs,
  });

  if (result.ok) return { ok: true };

  if (result.code === 'MISSING_HEADER' || result.code === 'INVALID_TIMESTAMP') {
    return { ok: false, status: 401, message: result.message };
  }

  if (result.code === 'EXPIRED') {
    return { ok: false, status: 401, message: result.message };
  }

  if (result.code === 'UNKNOWN_KEY') {
    return { ok: false, status: 403, message: result.message };
  }

  if (result.code === 'REPLAYED') {
    return { ok: false, status: 409, message: result.message };
  }

  return { ok: false, status: 403, message: result.message };
};

const validateRequest = (
  req: IncomingMessage,
  payload: unknown
): { valid: boolean; error?: { code: string; message: string } } => {
  if (req.method !== 'POST') {
    return { valid: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } };
  }

  if (
    payload === undefined ||
    payload === null ||
    typeof payload !== 'object' ||
    Object.keys(payload).length === 0
  ) {
    return { valid: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid body' } };
  }

  return { valid: true };
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

  if (shouldVerifySignature(config.signing, headers)) {
    const verified = await verifyRequestSignature(req, body, config.signing);
    if (!verified.ok) {
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

const handleEndpoint = (path: string, rows: unknown, res: ServerResponse): void => {
  if (path === '/zin/mysql/query') {
    respondJson(res, 200, normalizeResult(rows));
    return;
  }

  if (path === '/zin/mysql/queryOne') {
    if (Array.isArray(rows)) {
      respondJson(res, 200, { row: (rows[0] as unknown) ?? null });
      return;
    }
    respondJson(res, 200, { row: null });
    return;
  }

  if (path === '/zin/mysql/exec') {
    const normalized = normalizeResult(rows);
    respondJson(res, 200, {
      ok: true,
      meta: { changes: normalized.rowCount, lastRowId: normalized.lastInsertId },
    });
    return;
  }

  respondJson(res, 404, { code: 'NOT_FOUND', message: 'Unknown endpoint' });
};

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  pool: Pool,
  config: ProxyConfig
): Promise<void> => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  let payload: Record<string, unknown> | null = null;
  let body = '';

  try {
    body = await readBody(req, config.maxBodyBytes);
    payload = body.trim() === '' ? null : (JSON.parse(body) as Record<string, unknown>);
  } catch (error) {
    respondJson(res, 400, { code: 'INVALID_JSON', message: String(error) });
    return;
  }

  // Validate request
  const validation = validateRequest(req, payload);
  if (!validation.valid) {
    respondJson(
      res,
      400,
      validation.error ?? { code: 'VALIDATION_ERROR', message: 'Invalid request' }
    );
    return;
  }

  // Verify signature if needed
  const signatureResult = await verifySignatureIfNeeded(req, body, config);
  if (!signatureResult.ok) {
    const error = signatureResult.error ?? { status: 401, message: 'Unauthorized' };
    respondJson(res, error.status, {
      code: 'UNAUTHORIZED',
      message: error.message,
    });
    return;
  }

  // Validate SQL payload
  const sqlValidation = validateSqlPayload(payload ?? ({} as Record<string, unknown>));
  if (!sqlValidation.valid) {
    respondJson(
      res,
      400,
      sqlValidation.error ?? { code: 'VALIDATION_ERROR', message: 'Invalid SQL payload' }
    );
    return;
  }

  // Execute SQL
  try {
    // optimization: use .query() instead of .execute() to avoid prepared statement caching/roundtrips
    // which can cause memory leaks on the server and performance bottlenecks in proxy scenarios.
    const [rows] = await pool.query(sqlValidation.sql ?? '', sqlValidation.params ?? []);
    handleEndpoint(path, rows, res);
  } catch (error) {
    respondJson(res, 500, { code: 'MYSQL_ERROR', message: String(error) });
  }
};

export const MySqlProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);

    // Debug: surface resolved config so we can compare watch vs non-watch runs
    try {
      Logger.info(
        `MySQL proxy config: proxyHost=${config.host} proxyPort=${config.port} dbHost=${String(
          config.poolOptions.host
        )} dbPort=${String(config.poolOptions.port)} dbName=${String(
          config.poolOptions.database
        )} dbUser=${String(config.poolOptions.user)}`
      );
    } catch {
      // noop - logging must not block startup
    }

    if (
      config.signing.require &&
      (config.signing.keyId.trim() === '' || config.signing.secret === '')
    ) {
      throw ErrorFactory.createConfigError(
        'MYSQL_PROXY_REQUIRE_SIGNING is enabled but MYSQL_PROXY_KEY_ID/SECRET are missing'
      );
    }

    const pool = createPool(config.poolOptions);

    const server = createServer((req, res) => {
      handleRequest(req, res, pool, config).catch((error) => {
        respondJson(res, 500, { code: 'UNHANDLED', message: String(error) });
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', (error) => reject(error));
      server.listen(config.port, config.host, () => resolve());
    });

    Logger.info(`MySQL proxy listening on http://${config.host}:${config.port}`);
  },
});

export default MySqlProxyServer;
