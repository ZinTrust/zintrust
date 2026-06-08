import { Env } from '@config/env';

export type OfficialPluginImageMode = 'base' | 'worker';

type OfficialPluginRegistration = Readonly<{
  packageName: string;
  specifier: string;
  isEnabled: () => boolean;
}>;

const readEnvString = (...keys: string[]): string => {
  for (const key of keys) {
    const value = Env.get(key, '').trim().toLowerCase();
    if (value !== '') return value;
  }

  return '';
};

const readEnvBool = (key: string): boolean => Env.getBool(key, false);

const isSelected = (keys: ReadonlyArray<string>, expected: ReadonlyArray<string>): boolean => {
  const value = readEnvString(...keys);
  return value !== '' && expected.includes(value);
};

const looksLikeSqlitePath = (): boolean => {
  const raw = readEnvString('DB_PATH', 'DB_DATABASE');
  if (raw === '') return false;
  if (raw === ':memory:') return true;
  return (
    raw.includes('/') ||
    raw.includes('\\') ||
    raw.endsWith('.sqlite') ||
    raw.endsWith('.db') ||
    raw.startsWith('.') ||
    raw.startsWith('~')
  );
};

const baseRegistrations = Object.freeze([
  {
    packageName: '@zintrust/db-postgres',
    specifier: '@zintrust/db-postgres/register',
    isEnabled: () => isSelected(['DB_CONNECTION'], ['postgresql', 'postgres', 'pg']),
  },
  {
    packageName: '@zintrust/db-mysql',
    specifier: '@zintrust/db-mysql/register',
    isEnabled: () => isSelected(['DB_CONNECTION'], ['mysql']),
  },
  {
    packageName: '@zintrust/db-sqlserver',
    specifier: '@zintrust/db-sqlserver/register',
    isEnabled: () => isSelected(['DB_CONNECTION'], ['sqlserver', 'sql-server', 'mssql']),
  },
  {
    packageName: '@zintrust/db-sqlite',
    specifier: '@zintrust/db-sqlite/register',
    isEnabled: () => isSelected(['DB_CONNECTION'], ['sqlite']) || looksLikeSqlitePath(),
  },
  {
    packageName: '@zintrust/queue-redis',
    specifier: '@zintrust/queue-redis/register',
    isEnabled: () =>
      isSelected(['QUEUE_DRIVER'], ['redis']) ||
      isSelected(['BROADCAST_CONNECTION', 'BROADCAST_DRIVER'], ['redis', 'redishttps']),
  },
  {
    packageName: '@zintrust/queue-rabbitmq',
    specifier: '@zintrust/queue-rabbitmq/register',
    isEnabled: () => isSelected(['QUEUE_DRIVER'], ['rabbitmq']),
  },
  {
    packageName: '@zintrust/queue-sqs',
    specifier: '@zintrust/queue-sqs/register',
    isEnabled: () => isSelected(['QUEUE_DRIVER'], ['sqs']),
  },
  {
    packageName: '@zintrust/queue-cloudflare',
    specifier: '@zintrust/queue-cloudflare/register',
    isEnabled: () =>
      isSelected(['QUEUE_DRIVER'], ['cloudflare', 'cloudflare-queues', 'cf-queues']),
  },
  {
    packageName: '@zintrust/cache-redis',
    specifier: '@zintrust/cache-redis/register',
    isEnabled: () => isSelected(['CACHE_CONNECTION', 'CACHE_DRIVER'], ['redis']),
  },
  {
    packageName: '@zintrust/cache-mongodb',
    specifier: '@zintrust/cache-mongodb/register',
    isEnabled: () => isSelected(['CACHE_CONNECTION', 'CACHE_DRIVER'], ['mongodb']),
  },
  {
    packageName: '@zintrust/mail-nodemailer',
    specifier: '@zintrust/mail-nodemailer/register',
    isEnabled: () => isSelected(['MAIL_CONNECTION', 'MAIL_DRIVER'], ['nodemailer']),
  },
  {
    packageName: '@zintrust/mail-smtp',
    specifier: '@zintrust/mail-smtp/register',
    isEnabled: () => isSelected(['MAIL_CONNECTION', 'MAIL_DRIVER'], ['smtp']),
  },
  {
    packageName: '@zintrust/mail-sendgrid',
    specifier: '@zintrust/mail-sendgrid/register',
    isEnabled: () => isSelected(['MAIL_CONNECTION', 'MAIL_DRIVER'], ['sendgrid']),
  },
  {
    packageName: '@zintrust/mail-mailgun',
    specifier: '@zintrust/mail-mailgun/register',
    isEnabled: () => isSelected(['MAIL_CONNECTION', 'MAIL_DRIVER'], ['mailgun']),
  },
  {
    packageName: '@zintrust/storage-s3',
    specifier: '@zintrust/storage-s3/register',
    isEnabled: () => isSelected(['STORAGE_CONNECTION', 'STORAGE_DRIVER', 'BACKUP_DRIVER'], ['s3']),
  },
  {
    packageName: '@zintrust/storage-r2',
    specifier: '@zintrust/storage-r2/register',
    isEnabled: () => isSelected(['STORAGE_CONNECTION', 'STORAGE_DRIVER', 'BACKUP_DRIVER'], ['r2']),
  },
  {
    packageName: '@zintrust/storage-gcs',
    specifier: '@zintrust/storage-gcs/register',
    isEnabled: () => isSelected(['STORAGE_CONNECTION', 'STORAGE_DRIVER', 'BACKUP_DRIVER'], ['gcs']),
  },
  {
    packageName: '@zintrust/socket',
    specifier: '@zintrust/socket/register',
    isEnabled: () => readEnvBool('SOCKET_ENABLED'),
  },
] satisfies ReadonlyArray<OfficialPluginRegistration>);

const workerRegistrations = Object.freeze([
  {
    packageName: '@zintrust/workers',
    specifier: '@zintrust/workers/register',
    isEnabled: () => readEnvBool('WORKER_ENABLED'),
  },
] satisfies ReadonlyArray<OfficialPluginRegistration>);

const basePackages = Object.freeze(baseRegistrations.map(({ packageName }) => packageName));
const workerPackages = Object.freeze(workerRegistrations.map(({ packageName }) => packageName));
const baseAutoImports = Object.freeze(baseRegistrations.map(({ specifier }) => specifier));
const workerAutoImports = Object.freeze(workerRegistrations.map(({ specifier }) => specifier));

const unique = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
  Object.freeze([...new Set(values)]);

const getRelevantRegistrations = (
  mode: OfficialPluginImageMode = 'base'
): ReadonlyArray<OfficialPluginRegistration> => {
  return mode === 'worker'
    ? unique([...baseRegistrations, ...workerRegistrations]).filter((entry) => entry.isEnabled())
    : baseRegistrations.filter((entry) => entry.isEnabled());
};

export const OfficialPlugins = Object.freeze({
  basePackages,
  workerPackages,
  baseAutoImports,
  workerAutoImports,
  getPackages(mode: OfficialPluginImageMode = 'base'): ReadonlyArray<string> {
    return getRelevantRegistrations(mode).map(({ packageName }) => packageName);
  },
  getAutoImports(mode: OfficialPluginImageMode = 'base'): ReadonlyArray<string> {
    return getRelevantRegistrations(mode).map(({ specifier }) => specifier);
  },
});
