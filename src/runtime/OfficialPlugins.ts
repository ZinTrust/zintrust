export type OfficialPluginImageMode = 'base' | 'worker';

const basePackages = Object.freeze([
  '@zintrust/db-postgres',
  '@zintrust/db-mysql',
  '@zintrust/db-sqlserver',
  '@zintrust/db-sqlite',
  '@zintrust/queue-redis',
  '@zintrust/queue-rabbitmq',
  '@zintrust/queue-sqs',
  '@zintrust/cache-redis',
  '@zintrust/cache-mongodb',
  '@zintrust/mail-nodemailer',
  '@zintrust/mail-smtp',
  '@zintrust/mail-sendgrid',
  '@zintrust/mail-mailgun',
  '@zintrust/storage-s3',
  '@zintrust/storage-r2',
  '@zintrust/storage-gcs',
  '@zintrust/socket',
]);

const workerPackages = Object.freeze(['@zintrust/workers', '@zintrust/queue-monitor']);

const baseAutoImports = Object.freeze([
  '@zintrust/db-postgres/register',
  '@zintrust/db-mysql/register',
  '@zintrust/db-sqlserver/register',
  '@zintrust/db-sqlite/register',
  '@zintrust/queue-redis/register',
  '@zintrust/queue-rabbitmq/register',
  '@zintrust/queue-sqs/register',
  '@zintrust/cache-redis/register',
  '@zintrust/cache-mongodb/register',
  '@zintrust/mail-nodemailer/register',
  '@zintrust/mail-smtp/register',
  '@zintrust/mail-sendgrid/register',
  '@zintrust/mail-mailgun/register',
  '@zintrust/storage-s3/register',
  '@zintrust/storage-r2/register',
  '@zintrust/storage-gcs/register',
  '@zintrust/socket/register',
]);

const workerAutoImports = Object.freeze(['@zintrust/workers/register']);

const unique = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> =>
  Object.freeze([...new Set(values)]);

export const OfficialPlugins = Object.freeze({
  basePackages,
  workerPackages,
  baseAutoImports,
  workerAutoImports,
  getPackages(mode: OfficialPluginImageMode = 'base'): ReadonlyArray<string> {
    return mode === 'worker' ? unique([...basePackages, ...workerPackages]) : basePackages;
  },
  getAutoImports(mode: OfficialPluginImageMode = 'base'): ReadonlyArray<string> {
    return mode === 'worker' ? unique([...baseAutoImports, ...workerAutoImports]) : baseAutoImports;
  },
});
