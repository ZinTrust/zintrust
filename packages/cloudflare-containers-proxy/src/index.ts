import { Container } from '@cloudflare/containers';

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
  return {
    ...createCommonProxyEnvVars(env),
    MYSQL_PROXY_REQUIRE_SIGNING: 'true',
    MYSQL_PROXY_KEY_ID: toStringEnv(env.MYSQL_PROXY_KEY_ID, ''),
    MYSQL_PROXY_SECRET: toStringEnv(env.MYSQL_PROXY_SECRET, ''),
    MYSQL_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.MYSQL_PROXY_SIGNING_WINDOW_MS, '60000'),
    MYSQL_PROXY_POOL_LIMIT: toStringEnv(env.MYSQL_PROXY_POOL_LIMIT, '100'),

    MYSQL_DB_HOST: toStringEnv(env.MYSQL_DB_HOST, ''),
    MYSQL_DB_PORT: toStringEnv(env.MYSQL_DB_PORT, '3306'),
    MYSQL_DB_DATABASE: toStringEnv(env.MYSQL_DB_DATABASE, 'zintrust'),
    MYSQL_DB_USERNAME: toStringEnv(env.MYSQL_DB_USERNAME, 'zintrust'),
    MYSQL_DB_PASSWORD: toStringEnv(env.MYSQL_DB_PASSWORD, ''),

    DB_HOST: toStringEnv(env.MYSQL_DB_HOST, ''),
    DB_PORT: toStringEnv(env.MYSQL_DB_PORT, '3306'),
    DB_DATABASE: toStringEnv(env.MYSQL_DB_DATABASE, 'zintrust'),
    DB_USERNAME: toStringEnv(env.MYSQL_DB_USERNAME, 'zintrust'),
    DB_PASSWORD: toStringEnv(env.MYSQL_DB_PASSWORD, ''),
  };
};

const createPostgresProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  return {
    ...createCommonProxyEnvVars(env),
    POSTGRES_PROXY_REQUIRE_SIGNING: 'true',
    POSTGRES_PROXY_KEY_ID: toStringEnv(env.POSTGRES_PROXY_KEY_ID, ''),
    POSTGRES_PROXY_SECRET: toStringEnv(env.POSTGRES_PROXY_SECRET, ''),
    POSTGRES_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.POSTGRES_PROXY_SIGNING_WINDOW_MS, '60000'),
    POSTGRES_PROXY_POOL_LIMIT: toStringEnv(env.POSTGRES_PROXY_POOL_LIMIT, '100'),

    DB_HOST: toStringEnv(env.POSTGRES_DB_HOST, ''),
    DB_PORT_POSTGRESQL: toStringEnv(env.POSTGRES_DB_PORT, '5432'),
    DB_DATABASE_POSTGRESQL: toStringEnv(env.POSTGRES_DB_DATABASE, 'postgres'),
    DB_USERNAME_POSTGRESQL: toStringEnv(env.POSTGRES_DB_USERNAME, 'postgres'),
    DB_PASSWORD_POSTGRESQL: toStringEnv(env.POSTGRES_DB_PASSWORD, ''),
  };
};

const createRedisProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  return {
    ...createCommonProxyEnvVars(env),
    REDIS_PROXY_REQUIRE_SIGNING: 'true',
    REDIS_PROXY_KEY_ID: toStringEnv(env.REDIS_PROXY_KEY_ID, ''),
    REDIS_PROXY_SECRET: toStringEnv(env.REDIS_PROXY_SECRET, ''),
    REDIS_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.REDIS_PROXY_SIGNING_WINDOW_MS, '60000'),

    REDIS_PROXY_TARGET_HOST: toStringEnv(env.REDIS_PROXY_TARGET_HOST, ''),
    REDIS_PROXY_TARGET_PORT: toStringEnv(env.REDIS_PROXY_TARGET_PORT, '6379'),
    REDIS_PROXY_TARGET_PASSWORD: toStringEnv(env.REDIS_PROXY_TARGET_PASSWORD, ''),
    REDIS_PROXY_TARGET_DB: toStringEnv(env.REDIS_PROXY_TARGET_DB, '0'),

    REDIS_HOST: toStringEnv(env.REDIS_PROXY_TARGET_HOST, ''),
    REDIS_PORT: toStringEnv(env.REDIS_PROXY_TARGET_PORT, '6379'),
    REDIS_PASSWORD: toStringEnv(env.REDIS_PROXY_TARGET_PASSWORD, ''),
    REDIS_DB: toStringEnv(env.REDIS_PROXY_TARGET_DB, '0'),
  };
};

const createMongoDbProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  return {
    ...createCommonProxyEnvVars(env),
    MONGODB_PROXY_REQUIRE_SIGNING: 'true',
    MONGODB_PROXY_KEY_ID: toStringEnv(env.MONGODB_PROXY_KEY_ID, ''),
    MONGODB_PROXY_SECRET: toStringEnv(env.MONGODB_PROXY_SECRET, ''),
    MONGODB_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.MONGODB_PROXY_SIGNING_WINDOW_MS, '60000'),

    MONGO_URI: toStringEnv(env.MONGODB_PROXY_TARGET_URI, ''),
    MONGO_DB: toStringEnv(env.MONGODB_PROXY_TARGET_DB, 'zintrust'),
  };
};

const createSqlServerProxyEnvVars = (env: ZintrustContainersProxyEnv): StringRecord => {
  return {
    ...createCommonProxyEnvVars(env),
    SQLSERVER_PROXY_REQUIRE_SIGNING: 'true',
    SQLSERVER_PROXY_KEY_ID: toStringEnv(env.SQLSERVER_PROXY_KEY_ID, ''),
    SQLSERVER_PROXY_SECRET: toStringEnv(env.SQLSERVER_PROXY_SECRET, ''),
    SQLSERVER_PROXY_SIGNING_WINDOW_MS: toStringEnv(env.SQLSERVER_PROXY_SIGNING_WINDOW_MS, '60000'),
    SQLSERVER_PROXY_POOL_LIMIT: toStringEnv(env.SQLSERVER_PROXY_POOL_LIMIT, '100'),

    DB_HOST_MSSQL: toStringEnv(env.SQLSERVER_DB_HOST, ''),
    DB_PORT_MSSQL: toStringEnv(env.SQLSERVER_DB_PORT, '1433'),
    DB_DATABASE_MSSQL: toStringEnv(env.SQLSERVER_DB_DATABASE, 'zintrust'),
    DB_USERNAME_MSSQL: toStringEnv(env.SQLSERVER_DB_USERNAME, 'sa'),
    DB_PASSWORD_MSSQL: toStringEnv(env.SQLSERVER_DB_PASSWORD, ''),
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
  pingEndpoint = '/health';

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
  pingEndpoint = '/health';

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
  pingEndpoint = '/health';

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
  pingEndpoint = '/health';

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
  pingEndpoint = '/health';

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
  pingEndpoint = '/health';

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
};

const ROUTES: Readonly<Record<string, RouteDef>> = Object.freeze({
  mysql: { binding: 'ZT_PROXY_MYSQL', prefix: '/mysql' },
  postgres: { binding: 'ZT_PROXY_POSTGRES', prefix: '/postgres' },
  redis: { binding: 'ZT_PROXY_REDIS', prefix: '/redis' },
  mongodb: { binding: 'ZT_PROXY_MONGODB', prefix: '/mongodb' },
  sqlserver: { binding: 'ZT_PROXY_SQLSERVER', prefix: '/sqlserver' },
  smtp: { binding: 'ZT_PROXY_SMTP', prefix: '/smtp' },
});

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

    const segments = url.pathname.split('/').filter((p) => p.trim() !== '');
    const firstSegment = segments.length > 0 ? segments[0] : '';

    const def = ROUTES[firstSegment];
    if (!def) {
      return createJson({ error: 'not_found', message: 'Unknown proxy route' }, { status: 404 });
    }

    const namespace = env[def.binding];
    const stub = namespace.getByName(CONTAINER_INSTANCE_NAME);
    return stub.fetch(rewritePrefix(request, def.prefix));
  },
};
