/**
 * Plugin Registry
 * Defines available plugins, their dependencies, and template paths.
 */

export interface PluginDefinition {
  name: string;
  description: string;
  type: 'database-adapter' | 'feature' | 'driver';
  aliases: string[];
  dependencies: string[];
  devDependencies: string[];
  /**
   * Optional module specifiers to auto-import inside the project.
   * Used to register adapters/drivers via side-effect imports.
   */
  autoImports?: string[];
  templates: {
    source: string; // Path relative to src/templates/
    destination: string; // Path relative to project root
  }[];
  postInstall?: {
    message?: string;
    command?: string;
  };
}

type PluginTemplates = PluginDefinition['templates'];

const feature = (config: {
  name: string;
  description: string;
  aliases: string[];
  templates: PluginTemplates;
  dependencies?: string[];
  devDependencies?: string[];
  autoImports?: string[];
  postInstall?: PluginDefinition['postInstall'];
}): PluginDefinition => ({
  name: config.name,
  description: config.description,
  type: 'feature',
  aliases: config.aliases,
  dependencies: config.dependencies ?? [],
  devDependencies: config.devDependencies ?? [],
  autoImports: config.autoImports,
  templates: config.templates,
  postInstall: config.postInstall,
});

const driver = (config: {
  name: string;
  description: string;
  aliases: string[];
  dependencies: string[];
  autoImports?: string[];
}): PluginDefinition => ({
  name: config.name,
  description: config.description,
  type: 'driver',
  aliases: config.aliases,
  dependencies: config.dependencies,
  devDependencies: [],
  autoImports: config.autoImports,
  templates: [],
});

const adapter = (config: {
  name: string;
  description: string;
  aliases: string[];
  dependency: string;
  autoImport: string;
}): PluginDefinition => ({
  name: config.name,
  description: config.description,
  type: 'database-adapter',
  aliases: config.aliases,
  dependencies: [config.dependency],
  devDependencies: [],
  autoImports: [config.autoImport],
  templates: [],
});

export const PluginRegistry: Record<string, PluginDefinition> = {
  'feature:auth': {
    name: 'Authentication Feature',
    description: 'JWT and Bcrypt based authentication helper',
    type: 'feature',
    aliases: ['f:auth', 'auth'],
    dependencies: ['jsonwebtoken', 'bcrypt'],
    devDependencies: ['@types/jsonwebtoken', '@types/bcrypt'],
    templates: [
      {
        source: 'auth/Auth.ts.tpl',
        destination: 'src/auth/Auth.ts',
      },
    ],
    postInstall: {
      message: 'Authentication installed! Please add JWT_SECRET to your .env file.',
    },
  },
  'feature:queue': feature({
    name: 'Queue Feature',
    description: 'Simple job queue interface (In-Memory default)',
    aliases: ['f:queue', 'queue'],
    templates: [
      {
        source: 'features/Queue.ts.tpl',
        destination: 'src/features/Queue.ts',
      },
    ],
  }),
  'driver:queue-redis': driver({
    name: 'Redis Queue Driver',
    description: 'Redis-backed queue driver (installs @zintrust/queue-redis)',
    aliases: ['queue:redis'],
    dependencies: ['@zintrust/queue-redis'],
    autoImports: ['@zintrust/queue-redis/register'],
  }),
  'driver:queue-rabbitmq': driver({
    name: 'RabbitMQ Queue Driver',
    description: 'RabbitMQ-backed queue driver (installs @zintrust/queue-rabbitmq)',
    aliases: ['queue:rabbitmq', 'queue:amqp'],
    dependencies: ['@zintrust/queue-rabbitmq', 'amqplib'],
    autoImports: ['@zintrust/queue-rabbitmq/register'],
  }),
  'driver:queue-sqs': driver({
    name: 'AWS SQS Queue Driver',
    description: 'SQS-backed queue driver (installs @zintrust/queue-sqs)',
    aliases: ['queue:sqs'],
    dependencies: ['@zintrust/queue-sqs', '@aws-sdk/client-sqs'],
    autoImports: ['@zintrust/queue-sqs/register'],
  }),
  'driver:broadcast-redis': driver({
    name: 'Redis Broadcast Driver',
    description: 'Redis-backed broadcast driver (installs redis client dependency)',
    aliases: ['broadcast:redis'],
    dependencies: ['redis'],
  }),
  'driver:cache-redis': driver({
    name: 'Redis Cache Driver',
    description: 'Redis-backed cache driver (installs @zintrust/cache-redis)',
    aliases: ['cache:redis'],
    dependencies: ['@zintrust/cache-redis'],
    autoImports: ['@zintrust/cache-redis/register'],
  }),
  'driver:cache-mongodb': driver({
    name: 'MongoDB Cache Driver',
    description: 'MongoDB Atlas Data API cache driver (installs @zintrust/cache-mongodb)',
    aliases: ['cache:mongodb', 'cache:mongo'],
    dependencies: ['@zintrust/cache-mongodb'],
    autoImports: ['@zintrust/cache-mongodb/register'],
  }),
  'driver:mail-nodemailer': driver({
    name: 'Nodemailer Mail Driver',
    description: 'Nodemailer-based mail driver (installs @zintrust/mail-nodemailer)',
    aliases: ['mail:nodemailer'],
    dependencies: ['@zintrust/mail-nodemailer'],
    autoImports: ['@zintrust/mail-nodemailer/register'],
  }),
  'driver:mail-smtp': driver({
    name: 'SMTP Mail Driver',
    description: 'SMTP mail driver (installs @zintrust/mail-smtp)',
    aliases: ['mail:smtp'],
    dependencies: ['@zintrust/mail-smtp'],
    autoImports: ['@zintrust/mail-smtp/register'],
  }),
  'driver:mail-sendgrid': driver({
    name: 'SendGrid Mail Driver',
    description: 'SendGrid mail driver (installs @zintrust/mail-sendgrid)',
    aliases: ['mail:sendgrid'],
    dependencies: ['@zintrust/mail-sendgrid'],
    autoImports: ['@zintrust/mail-sendgrid/register'],
  }),
  'driver:mail-mailgun': driver({
    name: 'Mailgun Mail Driver',
    description: 'Mailgun mail driver (installs @zintrust/mail-mailgun)',
    aliases: ['mail:mailgun'],
    dependencies: ['@zintrust/mail-mailgun'],
    autoImports: ['@zintrust/mail-mailgun/register'],
  }),
  'driver:storage-s3': driver({
    name: 'S3 Storage Driver',
    description: 'S3 storage driver (installs @zintrust/storage-s3)',
    aliases: ['storage:s3'],
    dependencies: ['@zintrust/storage-s3'],
    autoImports: ['@zintrust/storage-s3/register'],
  }),
  'driver:storage-r2': driver({
    name: 'R2 Storage Driver',
    description: 'Cloudflare R2 storage driver (installs @zintrust/storage-r2)',
    aliases: ['storage:r2'],
    dependencies: ['@zintrust/storage-r2'],
    autoImports: ['@zintrust/storage-r2/register'],
  }),
  'driver:storage-gcs': driver({
    name: 'GCS Storage Driver',
    description: 'Google Cloud Storage driver (installs @zintrust/storage-gcs)',
    aliases: ['storage:gcs'],
    dependencies: ['@zintrust/storage-gcs', '@google-cloud/storage'],
    autoImports: ['@zintrust/storage-gcs/register'],
  }),
  'adapter:postgres': adapter({
    name: 'PostgreSQL Adapter',
    description: 'Production-ready PostgreSQL database adapter using pg',
    aliases: ['a:postgres', 'pg', 'db:postgres', 'postgresql', 'db:postgresql'],
    dependency: '@zintrust/db-postgres',
    autoImport: '@zintrust/db-postgres/register',
  }),
  'adapter:mysql': adapter({
    name: 'MySQL Adapter',
    description: 'Production-ready MySQL database adapter using mysql2',
    aliases: ['a:mysql', 'mysql', 'db:mysql'],
    dependency: '@zintrust/db-mysql',
    autoImport: '@zintrust/db-mysql/register',
  }),
  'adapter:mssql': adapter({
    name: 'SQL Server Adapter',
    description: 'Production-ready SQL Server database adapter using mssql',
    aliases: ['a:mssql', 'mssql', 'db:mssql'],
    dependency: '@zintrust/db-sqlserver',
    autoImport: '@zintrust/db-sqlserver/register',
  }),
  'adapter:sqlite': adapter({
    name: 'SQLite Adapter',
    description: 'SQLite database adapter using better-sqlite3',
    aliases: ['a:sqlite', 'sqlite', 'db:sqlite'],
    dependency: '@zintrust/db-sqlite',
    autoImport: '@zintrust/db-sqlite/register',
  }),
};
