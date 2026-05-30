import { Container } from '@cloudflare/containers';
import { ErrorFactory } from '@zintrust/core/errors';
import { Logger } from '@zintrust/core/logger';

type StringRecord = Record<string, string>;

type ContainerWithEnv = Container & { env: ZintrustContainersProxyEnv };

const getContainerEnv = (container: Container): ZintrustContainersProxyEnv => {
  return (container as unknown as ContainerWithEnv).env;
};

const toStringEnv = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return fallback;
};

const createCommonProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  const environment = toStringEnv(env.ENVIRONMENT, '');
  const nodeEnvFallback = environment.length > 0 ? environment : 'production';

  return {
    ENVIRONMENT: environment,
    NODE_ENV: toStringEnv(env.NODE_ENV, nodeEnvFallback),
    APP_NAME: toStringEnv(env.APP_NAME, 'ZinTrust'),
    APP_KEY: toStringEnv(env.APP_KEY, ''),
    CSRF_SKIP_PATHS: toStringEnv(env.CSRF_SKIP_PATHS, '/api/*,/queue-monitor/*'),
  };
};

const resolveZinBin = (env: ZintrustContainersProxyEnv): string => {
  return toStringEnv(env.ZT_ZIN_BIN, 'dist/bin/zin.js');
};

const createProxyEntrypoint = (
  env: ZintrustContainersProxyEnv,
  command: string,
  port: number
): string[] => {
  return ['node', resolveZinBin(env), command, '--host', '0.0.0.0', '--port', String(port)];
};

const createMySqlProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  const dbHost =
    toStringEnv(env.MYSQL_DB_HOST, '') ||
    toStringEnv(env.DB_HOST, '') ||
    toStringEnv(env.HOST, 'host.docker.internal');
  const dbPort = toStringEnv(env.MYSQL_DB_PORT, '') || toStringEnv(env.DB_PORT, '3306');
  const dbName = toStringEnv(env.MYSQL_DB_DATABASE, '') || toStringEnv(env.DB_DATABASE, 'zintrust');
  const dbUser = toStringEnv(env.MYSQL_DB_USERNAME, '') || toStringEnv(env.DB_USERNAME, 'root');
  const dbPass = toStringEnv(env.MYSQL_DB_PASSWORD, '') || toStringEnv(env.DB_PASSWORD, '');

  return {
    ...createCommonProxyEnvVars(env),
    MYSQL_PROXY_REQUIRE_SIGNING: 'true',
    MYSQL_PROXY_KEY_ID: toStringEnv(env.MYSQL_PROXY_KEY_ID, ''),
    MYSQL_PROXY_SECRET: toStringEnv(env.MYSQL_PROXY_SECRET, ''),
    MYSQL_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.MYSQL_PROXY_SIGNING_WINDOW_MS, '60000'),
    MYSQL_PROXY_POOL_LIMIT: toStringEnv(env.MYSQL_PROXY_POOL_LIMIT, '100'),

    MYSQL_DB_HOST: dbHost,
    MYSQL_DB_PORT: dbPort,
    MYSQL_DB_DATABASE: dbName,
    MYSQL_DB_USERNAME: dbUser,
    MYSQL_DB_PASSWORD: dbPass,

    DB_HOST: dbHost,
    DB_PORT: dbPort,
    DB_DATABASE: dbName,
    DB_USERNAME: dbUser,
    DB_PASSWORD: dbPass,
  };
};

const createPostgresProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  const dbHost =
    toStringEnv(env.POSTGRES_DB_HOST, '') ||
    toStringEnv(env.DB_HOST, '') ||
    toStringEnv(env.HOST, 'host.docker.internal');
  const dbPort =
    toStringEnv(env.POSTGRES_DB_PORT, '') || toStringEnv(env.DB_PORT_POSTGRESQL, '5432');
  const dbName =
    toStringEnv(env.POSTGRES_DB_DATABASE, '') ||
    toStringEnv(env.DB_DATABASE_POSTGRESQL, 'postgres');
  const dbUser =
    toStringEnv(env.POSTGRES_DB_USERNAME, '') ||
    toStringEnv(env.DB_USERNAME_POSTGRESQL, 'postgres');
  const dbPass =
    toStringEnv(env.POSTGRES_DB_PASSWORD, '') || toStringEnv(env.DB_PASSWORD_POSTGRESQL, '');

  return {
    ...createCommonProxyEnvVars(env),
    POSTGRES_PROXY_REQUIRE_SIGNING: 'true',
    POSTGRES_PROXY_KEY_ID: toStringEnv(env.POSTGRES_PROXY_KEY_ID, ''),
    POSTGRES_PROXY_SECRET: toStringEnv(env.POSTGRES_PROXY_SECRET, ''),
    POSTGRES_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.POSTGRES_PROXY_SIGNING_WINDOW_MS, '60000'),
    POSTGRES_PROXY_POOL_LIMIT: toStringEnv(env.POSTGRES_PROXY_POOL_LIMIT, '100'),

    DB_HOST: dbHost,
    DB_PORT_POSTGRESQL: dbPort,
    DB_DATABASE_POSTGRESQL: dbName,
    DB_USERNAME_POSTGRESQL: dbUser,
    DB_PASSWORD_POSTGRESQL: dbPass,
  };
};

const createRedisProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  const targetHost =
    toStringEnv(env.REDIS_PROXY_TARGET_HOST, '') ||
    toStringEnv(env.REDIS_HOST, '') ||
    toStringEnv(env.HOST, 'host.docker.internal');
  const targetPort =
    toStringEnv(env.REDIS_PROXY_TARGET_PORT, '') || toStringEnv(env.REDIS_PORT, '6379');
  const targetPassword =
    toStringEnv(env.REDIS_PROXY_TARGET_PASSWORD, '') || toStringEnv(env.REDIS_PASSWORD, '');
  const targetDb = toStringEnv(env.REDIS_PROXY_TARGET_DB, '') || toStringEnv(env.REDIS_DB, '0');

  return {
    ...createCommonProxyEnvVars(env),
    REDIS_PROXY_REQUIRE_SIGNING: 'true',
    REDIS_PROXY_KEY_ID: toStringEnv(env.REDIS_PROXY_KEY_ID, ''),
    REDIS_PROXY_SECRET: toStringEnv(env.REDIS_PROXY_SECRET, ''),
    REDIS_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.REDIS_PROXY_SIGNING_WINDOW_MS, '60000'),

    REDIS_PROXY_TARGET_HOST: targetHost,
    REDIS_PROXY_TARGET_PORT: targetPort,
    REDIS_PROXY_TARGET_PASSWORD: targetPassword,
    REDIS_PROXY_TARGET_DB: targetDb,

    REDIS_HOST: targetHost,
    REDIS_PORT: targetPort,
    REDIS_PASSWORD: targetPassword,
    REDIS_DB: targetDb,
  };
};

const createMongoDbProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  return {
    ...createCommonProxyEnvVars(env),
    MONGODB_PROXY_REQUIRE_SIGNING: 'true',
    MONGODB_PROXY_KEY_ID: toStringEnv(env.MONGODB_PROXY_KEY_ID, ''),
    MONGODB_PROXY_SECRET: toStringEnv(env.MONGODB_PROXY_SECRET, ''),
    MONGODB_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.MONGODB_PROXY_SIGNING_WINDOW_MS, '60000'),

    MONGO_URI: toStringEnv(env.MONGODB_PROXY_TARGET_URI, 'mongodb://host.docker.internal:27017'),
    MONGO_DB: toStringEnv(env.MONGODB_PROXY_TARGET_DB, 'zintrust'),
  };
};

const createSqlServerProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  const dbHost =
    toStringEnv(env.SQLSERVER_DB_HOST, '') ||
    toStringEnv(env.DB_HOST_MSSQL, '') ||
    toStringEnv(env.DB_HOST, '') ||
    toStringEnv(env.HOST, 'host.docker.internal');
  const dbPort = toStringEnv(env.SQLSERVER_DB_PORT, '') || toStringEnv(env.DB_PORT_MSSQL, '1433');
  const dbName =
    toStringEnv(env.SQLSERVER_DB_DATABASE, '') || toStringEnv(env.DB_DATABASE_MSSQL, 'zintrust');
  const dbUser =
    toStringEnv(env.SQLSERVER_DB_USERNAME, '') || toStringEnv(env.DB_USERNAME_MSSQL, 'sa');
  const dbPass =
    toStringEnv(env.SQLSERVER_DB_PASSWORD, '') || toStringEnv(env.DB_PASSWORD_MSSQL, '');

  return {
    ...createCommonProxyEnvVars(env),
    SQLSERVER_PROXY_REQUIRE_SIGNING: 'true',
    SQLSERVER_PROXY_KEY_ID: toStringEnv(env.SQLSERVER_PROXY_KEY_ID, ''),
    SQLSERVER_PROXY_SECRET: toStringEnv(env.SQLSERVER_PROXY_SECRET, ''),
    SQLSERVER_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.SQLSERVER_PROXY_SIGNING_WINDOW_MS, '60000'),
    SQLSERVER_PROXY_POOL_LIMIT: toStringEnv(env.SQLSERVER_PROXY_POOL_LIMIT, '100'),

    DB_HOST_MSSQL: dbHost,
    DB_PORT_MSSQL: dbPort,
    DB_DATABASE_MSSQL: dbName,
    DB_USERNAME_MSSQL: dbUser,
    DB_PASSWORD_MSSQL: dbPass,
  };
};

const createSmtpProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  return {
    ...createCommonProxyEnvVars(env),
    SMTP_PROXY_REQUIRE_SIGNING: 'true',
    SMTP_PROXY_KEY_ID: toStringEnv(env.SMTP_PROXY_KEY_ID, ''),
    SMTP_PROXY_SECRET: toStringEnv(env.SMTP_PROXY_SECRET, ''),
    SMTP_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.SMTP_PROXY_SIGNING_WINDOW_MS, '60000'),

    MAIL_DRIVER: 'smtp',
    MAIL_CONNECTION: 'smtp',
    MAIL_HOST: toStringEnv(env.MAIL_HOST, ''),
    MAIL_PORT: toStringEnv(env.MAIL_PORT, '587'),
    MAIL_SECURE: toStringEnv(env.MAIL_SECURE, 'false'),
    MAIL_USERNAME: toStringEnv(env.MAIL_USERNAME, ''),
    MAIL_PASSWORD: toStringEnv(env.MAIL_PASSWORD, ''),
    MAIL_FROM_ADDRESS: toStringEnv(env.MAIL_FROM_ADDRESS, ''),
    MAIL_FROM_NAME: toStringEnv(env.MAIL_FROM_NAME, 'ZinTrust'),
  };
};

const ensureContainerStarted = async (
  container: Container,
  port: number,
  start: { envVars: StringRecord; entrypoint: string[] }
): Promise<void> => {
  await container.startAndWaitForPorts({
    startOptions: {
      envVars: start.envVars,
      entrypoint: start.entrypoint,
      enableInternet: true,
    },
    ports: port,
  });
};

// Durable Object namespaces for container-enabled DOs.
// We keep this type intentionally loose so it doesn't require Workers runtime
// types in the core ZinTrust TypeScript project.
export type ZintrustContainerNamespace = {
  getByName(name: string): { fetch(request: Request): Promise<Response> };
};

export type ZintrustContainersProxyEnv = {
  ZT_PROXY_MYSQL: ZintrustContainerNamespace;
  ZT_PROXY_POSTGRES: ZintrustContainerNamespace;
  ZT_PROXY_REDIS: ZintrustContainerNamespace;
  ZT_PROXY_MONGODB: ZintrustContainerNamespace;
  ZT_PROXY_SQLSERVER: ZintrustContainerNamespace;
  ZT_PROXY_SMTP: ZintrustContainerNamespace;

  ENVIRONMENT?: string;
  NODE_ENV?: string;
  APP_NAME?: string;
  APP_KEY?: string;
  CSRF_SKIP_PATHS?: string;

  // Common DB fallbacks (present in .dev.vars)
  HOST?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_DATABASE?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;

  DB_PORT_POSTGRESQL?: string;
  DB_DATABASE_POSTGRESQL?: string;
  DB_USERNAME_POSTGRESQL?: string;
  DB_PASSWORD_POSTGRESQL?: string;

  DB_HOST_MSSQL?: string;
  DB_PORT_MSSQL?: string;
  DB_DATABASE_MSSQL?: string;
  DB_USERNAME_MSSQL?: string;
  DB_PASSWORD_MSSQL?: string;

  // Common Redis fallbacks (present in .dev.vars)
  REDIS_HOST?: string;
  REDIS_PORT?: string;
  REDIS_PASSWORD?: string;
  REDIS_DB?: string;

  // Optional override for the proxy entrypoint path inside the container image.
  // Defaults to "dist/bin/zin.js".
  ZT_ZIN_BIN?: string;

  MYSQL_PROXY_KEY_ID?: string;
  MYSQL_PROXY_SECRET?: string;
  MYSQL_PROXY_SIGNING_WINDOW_MS?: string;
  MYSQL_PROXY_POOL_LIMIT?: string;
  MYSQL_DB_HOST?: string;
  MYSQL_DB_PORT?: string;
  MYSQL_DB_DATABASE?: string;
  MYSQL_DB_USERNAME?: string;
  MYSQL_DB_PASSWORD?: string;

  POSTGRES_PROXY_KEY_ID?: string;
  POSTGRES_PROXY_SECRET?: string;
  POSTGRES_PROXY_SIGNING_WINDOW_MS?: string;
  POSTGRES_PROXY_POOL_LIMIT?: string;
  POSTGRES_DB_HOST?: string;
  POSTGRES_DB_PORT?: string;
  POSTGRES_DB_DATABASE?: string;
  POSTGRES_DB_USERNAME?: string;
  POSTGRES_DB_PASSWORD?: string;

  REDIS_PROXY_KEY_ID?: string;
  REDIS_PROXY_SECRET?: string;
  REDIS_PROXY_SIGNING_WINDOW_MS?: string;
  REDIS_PROXY_TARGET_HOST?: string;
  REDIS_PROXY_TARGET_PORT?: string;
  REDIS_PROXY_TARGET_PASSWORD?: string;
  REDIS_PROXY_TARGET_DB?: string;

  MONGODB_PROXY_KEY_ID?: string;
  MONGODB_PROXY_SECRET?: string;
  MONGODB_PROXY_SIGNING_WINDOW_MS?: string;
  MONGODB_PROXY_TARGET_URI?: string;
  MONGODB_PROXY_TARGET_DB?: string;

  SQLSERVER_PROXY_KEY_ID?: string;
  SQLSERVER_PROXY_SECRET?: string;
  SQLSERVER_PROXY_SIGNING_WINDOW_MS?: string;
  SQLSERVER_PROXY_POOL_LIMIT?: string;
  SQLSERVER_DB_HOST?: string;
  SQLSERVER_DB_PORT?: string;
  SQLSERVER_DB_DATABASE?: string;
  SQLSERVER_DB_USERNAME?: string;
  SQLSERVER_DB_PASSWORD?: string;

  SMTP_PROXY_KEY_ID?: string;
  SMTP_PROXY_SECRET?: string;
  SMTP_PROXY_SIGNING_WINDOW_MS?: string;
  MAIL_HOST?: string;
  MAIL_PORT?: string;
  MAIL_SECURE?: string;
  MAIL_USERNAME?: string;
  MAIL_PASSWORD?: string;
  MAIL_FROM_ADDRESS?: string;
  MAIL_FROM_NAME?: string;
};

// =============================================================================
// Container-backed Durable Object classes
// =============================================================================

export class ZintrustMySqlProxyContainer extends Container {
  defaultPort = 8789;
  sleepAfter = '10m';
  // Keep this lightweight: the proxy root path responds quickly (401 without
  // signing headers) and does not depend on DB connectivity like /health.
  pingEndpoint = 'containerstarthealthcheck';

  async fetch(request: Request): Promise<Response> {
    const env = getContainerEnv(this);
    await ensureContainerStarted(this, 8789, {
      envVars: createMySqlProxyEnvVars(env),
      entrypoint: createProxyEntrypoint(env, 'proxy:mysql', 8789),
    });

    return super.fetch(request);
  }
}

export class ZintrustPostgresProxyContainer extends Container {
  defaultPort = 8790;
  sleepAfter = '10m';
  pingEndpoint = 'containerstarthealthcheck';

  async fetch(request: Request): Promise<Response> {
    const env = getContainerEnv(this);
    await ensureContainerStarted(this, 8790, {
      envVars: createPostgresProxyEnvVars(env),
      entrypoint: createProxyEntrypoint(env, 'proxy:postgres', 8790),
    });

    return super.fetch(request);
  }
}

export class ZintrustRedisProxyContainer extends Container {
  defaultPort = 8791;
  sleepAfter = '10m';
  pingEndpoint = 'containerstarthealthcheck';

  async fetch(request: Request): Promise<Response> {
    const env = getContainerEnv(this);
    await ensureContainerStarted(this, 8791, {
      envVars: createRedisProxyEnvVars(env),
      entrypoint: createProxyEntrypoint(env, 'proxy:redis', 8791),
    });

    return super.fetch(request);
  }
}

export class ZintrustMongoDbProxyContainer extends Container {
  defaultPort = 8792;
  sleepAfter = '10m';
  pingEndpoint = 'containerstarthealthcheck';

  async fetch(request: Request): Promise<Response> {
    const env = getContainerEnv(this);
    await ensureContainerStarted(this, 8792, {
      envVars: createMongoDbProxyEnvVars(env),
      entrypoint: createProxyEntrypoint(env, 'proxy:mongodb', 8792),
    });

    return super.fetch(request);
  }
}

export class ZintrustSqlServerProxyContainer extends Container {
  defaultPort = 8793;
  sleepAfter = '10m';
  pingEndpoint = 'containerstarthealthcheck';

  async fetch(request: Request): Promise<Response> {
    const env = getContainerEnv(this);
    await ensureContainerStarted(this, 8793, {
      envVars: createSqlServerProxyEnvVars(env),
      entrypoint: createProxyEntrypoint(env, 'proxy:sqlserver', 8793),
    });

    return super.fetch(request);
  }
}

export class ZintrustSmtpProxyContainer extends Container {
  defaultPort = 8794;
  sleepAfter = '10m';
  pingEndpoint = 'containerstarthealthcheck';

  async fetch(request: Request): Promise<Response> {
    const env = getContainerEnv(this);
    await ensureContainerStarted(this, 8794, {
      envVars: createSmtpProxyEnvVars(env),
      entrypoint: createProxyEntrypoint(env, 'proxy:smtp', 8794),
    });

    return super.fetch(request);
  }
}

// =============================================================================
// Worker gateway (replaces docker-compose proxy-gateway)
// =============================================================================

const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json; charset=utf-8' });

const createJson = (
  value: unknown,
  init?: { status?: number; headers?: Record<string, string> }
): Response => {
  return new Response(JSON.stringify(value), {
    status: init?.status,
    headers: {
      ...JSON_HEADERS,
      ...(init?.headers ?? undefined),
    },
  });
};

const rewritePrefix = (request: Request, prefix: string): Request => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(prefix)) return request;

  const nextPath = url.pathname.slice(prefix.length);
  const normalized = nextPath === '' ? '/' : nextPath;
  url.pathname = normalized.startsWith('/') ? normalized : `/${normalized}`;

  return new Request(url.toString(), request);
};

const CONTAINER_INSTANCE_NAME = 'cf-singleton-container';

const CONTAINER_RETRY_ATTEMPTS = 20;
const CONTAINER_RETRY_DELAY_MS = 500;

const isContainerNotReadyMessage = (value: string): boolean => {
  return (
    value.includes('Monitor failed to find container') ||
    value.includes('container port not found') ||
    value.includes('Connection refused')
  );
};

const responseIndicatesContainerNotReady = async (response: Response): Promise<boolean> => {
  if (!response) return false;
  if (response.status !== 500) return false;
  try {
    const text = await response.clone().text();
    return isContainerNotReadyMessage(text);
  } catch {
    return false;
  }
};

const errorIndicatesContainerNotReady = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error);
  return isContainerNotReadyMessage(msg);
};

const sleepMs = async (ms: number): Promise<void> => {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    throw ErrorFactory.createValidationError(
      'Container retry sleep requires AbortSignal.timeout() support in this runtime'
    );
  }
  const signal = AbortSignal.timeout(ms);
  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
};

const createContainerNotReadyResponse = (_message?: string): Response => {
  return createJson(
    {
      error: 'container_not_ready',
      service: 'zintrust-containers-proxy',
      message: 'Container is starting. Retry shortly.',
    },
    { status: 503 }
  );
};

const fetchWithContainerRetry = async (
  stub: { fetch(request: Request): Promise<Response> },
  request: Request,
  attempt = 1
): Promise<Response> => {
  try {
    const requestClone = request.clone();
    const response = await stub.fetch(requestClone);
    const notReady = await responseIndicatesContainerNotReady(response);
    if (!notReady) return response;

    if (attempt >= CONTAINER_RETRY_ATTEMPTS) {
      return createContainerNotReadyResponse('Container monitor not ready (max retries reached).');
    }
    Logger.warn('Container not ready; retrying', { attempt, max: CONTAINER_RETRY_ATTEMPTS });
    await sleepMs(CONTAINER_RETRY_DELAY_MS);
    return fetchWithContainerRetry(stub, request, attempt + 1);
  } catch (error) {
    if (!errorIndicatesContainerNotReady(error)) throw error;
    if (attempt >= CONTAINER_RETRY_ATTEMPTS) {
      return createContainerNotReadyResponse(String(error));
    }
    Logger.warn('Container connection error; retrying', {
      attempt,
      max: CONTAINER_RETRY_ATTEMPTS,
      error: String(error),
    });
    await sleepMs(CONTAINER_RETRY_DELAY_MS);
    return fetchWithContainerRetry(stub, request, attempt + 1);
  }
};

type RouteDef = {
  binding: keyof Pick<
    ZintrustContainersProxyEnv,
    | 'ZT_PROXY_MYSQL'
    | 'ZT_PROXY_POSTGRES'
    | 'ZT_PROXY_REDIS'
    | 'ZT_PROXY_MONGODB'
    | 'ZT_PROXY_SQLSERVER'
    | 'ZT_PROXY_SMTP'
  >;
  prefix: `/${string}`;
  internalPrefix: `/zin/${string}`;
};

const ROUTES: Readonly<Record<string, RouteDef>> = Object.freeze({
  mysql: { binding: 'ZT_PROXY_MYSQL', prefix: '/mysql', internalPrefix: '/zin/mysql' },
  postgres: {
    binding: 'ZT_PROXY_POSTGRES',
    prefix: '/postgres',
    internalPrefix: '/zin/postgres',
  },
  redis: { binding: 'ZT_PROXY_REDIS', prefix: '/redis', internalPrefix: '/zin/redis' },
  mongodb: {
    binding: 'ZT_PROXY_MONGODB',
    prefix: '/mongodb',
    internalPrefix: '/zin/mongodb',
  },
  sqlserver: {
    binding: 'ZT_PROXY_SQLSERVER',
    prefix: '/sqlserver',
    internalPrefix: '/zin/sqlserver',
  },
  smtp: { binding: 'ZT_PROXY_SMTP', prefix: '/smtp', internalPrefix: '/zin/smtp' },
});

const matchesPrefix = (pathname: string, prefix: string): boolean => {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
};

const resolveRoute = (
  request: Request
):
  | {
      def: RouteDef;
      nextRequest: Request;
    }
  | undefined => {
  const pathname = new URL(request.url).pathname;

  for (const def of Object.values(ROUTES)) {
    if (matchesPrefix(pathname, def.prefix)) {
      return {
        def,
        nextRequest: rewritePrefix(request, def.prefix),
      };
    }

    if (matchesPrefix(pathname, def.internalPrefix)) {
      return {
        def,
        nextRequest: request,
      };
    }
  }

  return undefined;
};

export default {
  async fetch(request: Request, env: ZintrustContainersProxyEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return createJson({ status: 'ok', service: 'zintrust-containers-proxy' }, { status: 200 });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return createJson(
        {
          status: 'ok',
          service: 'zintrust-containers-proxy',
          routes: Object.keys(ROUTES).map((k) => `/${k}/*`),
        },
        { status: 200 }
      );
    }

    const resolved = resolveRoute(request);
    if (!resolved) {
      return createJson({ error: 'not_found', message: 'Unknown proxy route' }, { status: 404 });
    }

    const { def, nextRequest } = resolved;
    const namespace = env[def.binding];
    if (!namespace || typeof namespace.getByName !== 'function') {
      return createJson(
        {
          error: 'missing_binding',
          service: 'zintrust-containers-proxy',
          binding: def.binding,
          message:
            'Durable Object binding is missing. Ensure your Wrangler config defines durable_objects bindings for ZT_PROXY_* (and containers/migrations) for the selected --env.',
        },
        { status: 500 }
      );
    }
    const stub = namespace.getByName(CONTAINER_INSTANCE_NAME);

    return fetchWithContainerRetry(stub, nextRequest);
  },
};
