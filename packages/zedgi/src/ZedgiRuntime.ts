import { createZedgiClient, type ZedgiClient, type ZedgiClientOptions } from '@zedgi/zedgi-client';
import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import type { ZedgiDatabaseConfig, ZedgiQueueConfig, ZedgiRedisCacheConfig } from './types.js';

type ZedgiCredential = Record<string, unknown>;
type ServiceName = 'redis' | 'mysql' | 'postgres';
type CredentialProfiles = NonNullable<ZedgiClientOptions['credentials']>;

const profiles: CredentialProfiles = {
  redis: {},
  mysql: {},
  postgres: {},
};

let options: ZedgiClientOptions | undefined;
let client: ZedgiClient | undefined;
const profileNames = new WeakMap<ZedgiCredential, string>();
const redisCredentials = new Map<string, ZedgiCredential>();
const sqlCredentials = new Map<string, ZedgiCredential>();

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const normalizeHeader = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
};

const parseHeaderEnv = (key: string): Record<string, unknown> | undefined => {
  const raw = Env.get(key, '').trim();
  if (raw === '') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeHeader(parsed);
  } catch {
    return { value: raw };
  }
};

const ensureOptions = (): ZedgiClientOptions => {
  if (options !== undefined) return options;

  const url = Env.get('ZEDGI_URL', '').trim();
  const key = Env.get('ZEDGI_KEY', '').trim();
  if (url === '') throw ErrorFactory.createConfigError('ZEDGI_URL is required for Zedgi drivers');
  if (key === '') throw ErrorFactory.createConfigError('ZEDGI_KEY is required for Zedgi drivers');

  const next: Record<string, unknown> = {
    url,
    key,
    credentials: profiles,
    timeout: Env.getInt('ZEDGI_TIMEOUT', 10000),
  };

  const signingSecret = Env.get('ZEDGI_SIGNING_SECRET', Env.get('ZEDGI_SECRET', '')).trim();
  if (signingSecret !== '') next['signingSecret'] = signingSecret;

  const publicKey = Env.get('ZEDGI_PUBLIC_KEY', '').trim();
  const accountId = Env.get('ZEDGI_ACCOUNT_ID', '').trim();
  const keyVersionRaw = Env.get('ZEDGI_KEY_VERSION', '').trim();
  if (publicKey !== '' && accountId !== '' && keyVersionRaw !== '') {
    next['publicKey'] = publicKey;
    next['accountId'] = accountId;
    next['keyVersion'] = Number.parseInt(keyVersionRaw, 10);
  }

  options = next as ZedgiClientOptions;
  return options;
};

const ensureClient = (): ZedgiClient => {
  if (client !== undefined) return client;
  client = createZedgiClient(ensureOptions());
  return client;
};

const registerProfile = (
  service: ServiceName,
  profile: string,
  credential: ZedgiCredential
): ZedgiCredential => {
  profiles[service] ??= {};
  profiles[service][profile] = credential;
  profileNames.set(credential, profile);
  return credential;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const stableKey = (service: ServiceName, credential: ZedgiCredential): string =>
  `${service}:${stableStringify(credential)}`;

const memoizeCredential = (
  service: ServiceName,
  profilePrefix: string,
  credential: ZedgiCredential,
  cache: Map<string, ZedgiCredential>
): ZedgiCredential => {
  const key = stableKey(service, credential);
  const existing = cache.get(key);
  if (existing !== undefined) return existing;

  const profile = `${profilePrefix}-${cache.size + 1}`;
  cache.set(key, registerProfile(service, profile, credential));
  return credential;
};

const getProfileName = (credential: ZedgiCredential): string => {
  const profile = profileNames.get(credential);
  if (profile === undefined) {
    throw ErrorFactory.createConfigError('Zedgi credential profile was not registered');
  }
  return profile;
};

const redisCredentialFromConfig = (
  config: Partial<ZedgiRedisCacheConfig | ZedgiQueueConfig>,
  fallbackHeaderKey: string
): ZedgiCredential => {
  const credential: ZedgiCredential = {};
  if (hasText(config.password)) credential['password'] = config.password;
  if (typeof config.database === 'number' && Number.isFinite(config.database)) {
    credential['db'] = config.database;
  }

  const header = normalizeHeader(config.header) ?? parseHeaderEnv(fallbackHeaderKey);
  if (header !== undefined) credential['header'] = header;
  return credential;
};

const sqlCredentialFromConfig = (
  config: ZedgiDatabaseConfig,
  fallbackHeaderKey: string
): ZedgiCredential => {
  const credential: ZedgiCredential = {};
  if (hasText(config.username)) credential['user'] = config.username;
  if (hasText(config.password)) credential['password'] = config.password;
  if (hasText(config.database)) credential['database'] = config.database;
  if (typeof config.ssl === 'boolean') credential['ssl'] = config.ssl;

  const header = normalizeHeader(config.header) ?? parseHeaderEnv(fallbackHeaderKey);
  if (header !== undefined) credential['header'] = header;
  return credential;
};

const resolveSqlService = (driver: ZedgiDatabaseConfig['driver']): 'mysql' | 'postgres' =>
  driver === 'mysql-zedgi' ? 'mysql' : 'postgres';

export const ZedgiRuntime = Object.freeze({
  initialize(): ZedgiClient {
    return ensureClient();
  },

  async warm(): Promise<void> {
    try {
      await ensureClient().redis().ping();
    } catch {
      // warm-up ping failed silently
    }
  },

  shutdown(): void {
    client = undefined;
  },

  redis(config: Partial<ZedgiRedisCacheConfig | ZedgiQueueConfig> = {}) {
    const credential = memoizeCredential(
      'redis',
      'redis',
      redisCredentialFromConfig(config, 'ZEDGI_REDIS_HEADER'),
      redisCredentials
    );
    return ensureClient().redis(getProfileName(credential));
  },

  queue(name: string, config: Partial<ZedgiQueueConfig | ZedgiRedisCacheConfig> = {}) {
    const credential = memoizeCredential(
      'redis',
      'redis',
      redisCredentialFromConfig(config, 'ZEDGI_QUEUE_HEADER'),
      redisCredentials
    );
    return ensureClient().queue(name, getProfileName(credential));
  },

  sql(config: ZedgiDatabaseConfig) {
    const service = resolveSqlService(config.driver);
    const credential = memoizeCredential(
      service,
      service,
      sqlCredentialFromConfig(
        config,
        service === 'mysql' ? 'ZEDGI_MYSQL_HEADER' : 'ZEDGI_POSTGRES_HEADER'
      ),
      sqlCredentials
    );
    const profile = getProfileName(credential);
    return service === 'mysql' ? ensureClient().mysql(profile) : ensureClient().postgres(profile);
  },
});
