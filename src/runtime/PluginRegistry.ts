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
        source: 'features/Auth.ts.tpl',
        destination: 'src/features/Auth.ts',
      },
    ],
    postInstall: {
      message: 'Authentication installed! Please add JWT_SECRET to your .env file.',
    },
  },
  'feature:queue': {
    name: 'Queue Feature',
    description: 'Simple job queue interface (In-Memory default)',
    type: 'feature',
    aliases: ['f:queue', 'queue'],
    dependencies: [],
    devDependencies: [],
    templates: [
      {
        source: 'features/Queue.ts.tpl',
        destination: 'src/features/Queue.ts',
      },
    ],
  },
  'driver:queue-redis': {
    name: 'Redis Queue Driver',
    description: 'Redis-backed queue driver (installs @zintrust/queue-redis)',
    type: 'driver',
    aliases: ['queue:redis'],
    dependencies: ['@zintrust/queue-redis'],
    devDependencies: [],
    autoImports: ['@zintrust/queue-redis/register'],
    templates: [],
  },
  'driver:queue-rabbitmq': {
    name: 'RabbitMQ Queue Driver',
    description: 'RabbitMQ-backed queue driver (installs @zintrust/queue-rabbitmq)',
    type: 'driver',
    aliases: ['queue:rabbitmq', 'queue:amqp'],
    dependencies: ['@zintrust/queue-rabbitmq', 'amqplib'],
    devDependencies: [],
    autoImports: ['@zintrust/queue-rabbitmq/register'],
    templates: [],
  },
  'driver:queue-sqs': {
    name: 'AWS SQS Queue Driver',
    description: 'SQS-backed queue driver (installs @zintrust/queue-sqs)',
    type: 'driver',
    aliases: ['queue:sqs'],
    dependencies: ['@zintrust/queue-sqs', '@aws-sdk/client-sqs'],
    devDependencies: [],
    autoImports: ['@zintrust/queue-sqs/register'],
    templates: [],
  },
  'driver:broadcast-redis': {
    name: 'Redis Broadcast Driver',
    description: 'Redis-backed broadcast driver (installs redis client dependency)',
    type: 'driver',
    aliases: ['broadcast:redis'],
    dependencies: ['redis'],
    devDependencies: [],
    templates: [],
  },
  'driver:cache-redis': {
    name: 'Redis Cache Driver',
    description: 'Redis-backed cache driver (installs @zintrust/cache-redis)',
    type: 'driver',
    aliases: ['cache:redis'],
    dependencies: ['@zintrust/cache-redis'],
    devDependencies: [],
    autoImports: ['@zintrust/cache-redis/register'],
    templates: [],
  },
  'driver:cache-mongodb': {
    name: 'MongoDB Cache Driver',
    description: 'MongoDB Atlas Data API cache driver (installs @zintrust/cache-mongodb)',
    type: 'driver',
    aliases: ['cache:mongodb', 'cache:mongo'],
    dependencies: ['@zintrust/cache-mongodb'],
    devDependencies: [],
    autoImports: ['@zintrust/cache-mongodb/register'],
    templates: [],
  },
  'driver:mail-nodemailer': {
    name: 'Nodemailer Mail Driver',
    description: 'Nodemailer-based mail driver (installs @zintrust/mail-nodemailer)',
    type: 'driver',
    aliases: ['mail:nodemailer'],
    dependencies: ['@zintrust/mail-nodemailer'],
    devDependencies: [],
    autoImports: ['@zintrust/mail-nodemailer/register'],
    templates: [],
  },
  'driver:mail-smtp': {
    name: 'SMTP Mail Driver',
    description: 'SMTP mail driver (installs @zintrust/mail-smtp)',
    type: 'driver',
    aliases: ['mail:smtp'],
    dependencies: ['@zintrust/mail-smtp'],
    devDependencies: [],
    autoImports: ['@zintrust/mail-smtp/register'],
    templates: [],
  },
  'driver:mail-sendgrid': {
    name: 'SendGrid Mail Driver',
    description: 'SendGrid mail driver (installs @zintrust/mail-sendgrid)',
    type: 'driver',
    aliases: ['mail:sendgrid'],
    dependencies: ['@zintrust/mail-sendgrid'],
    devDependencies: [],
    autoImports: ['@zintrust/mail-sendgrid/register'],
    templates: [],
  },
  'driver:mail-mailgun': {
    name: 'Mailgun Mail Driver',
    description: 'Mailgun mail driver (installs @zintrust/mail-mailgun)',
    type: 'driver',
    aliases: ['mail:mailgun'],
    dependencies: ['@zintrust/mail-mailgun'],
    devDependencies: [],
    autoImports: ['@zintrust/mail-mailgun/register'],
    templates: [],
  },
  'driver:storage-s3': {
    name: 'S3 Storage Driver',
    description: 'S3 storage driver (installs @zintrust/storage-s3)',
    type: 'driver',
    aliases: ['storage:s3'],
    dependencies: ['@zintrust/storage-s3'],
    devDependencies: [],
    autoImports: ['@zintrust/storage-s3/register'],
    templates: [],
  },
  'driver:storage-r2': {
    name: 'R2 Storage Driver',
    description: 'Cloudflare R2 storage driver (installs @zintrust/storage-r2)',
    type: 'driver',
    aliases: ['storage:r2'],
    dependencies: ['@zintrust/storage-r2'],
    devDependencies: [],
    autoImports: ['@zintrust/storage-r2/register'],
    templates: [],
  },
  'driver:storage-gcs': {
    name: 'GCS Storage Driver',
    description: 'Google Cloud Storage driver (installs @zintrust/storage-gcs)',
    type: 'driver',
    aliases: ['storage:gcs'],
    dependencies: ['@zintrust/storage-gcs', '@google-cloud/storage'],
    devDependencies: [],
    autoImports: ['@zintrust/storage-gcs/register'],
    templates: [],
  },
  'adapter:postgres': {
    name: 'PostgreSQL Adapter',
    description: 'Production-ready PostgreSQL database adapter using pg',
    type: 'database-adapter',
    aliases: ['a:postgres', 'pg', 'db:postgres', 'postgresql', 'db:postgresql'],
    dependencies: ['@zintrust/db-postgres'],
    devDependencies: [],
    autoImports: ['@zintrust/db-postgres/register'],
    templates: [],
  },
  'adapter:mysql': {
    name: 'MySQL Adapter',
    description: 'Production-ready MySQL database adapter using mysql2',
    type: 'database-adapter',
    aliases: ['a:mysql', 'mysql', 'db:mysql'],
    dependencies: ['@zintrust/db-mysql'],
    devDependencies: [],
    autoImports: ['@zintrust/db-mysql/register'],
    templates: [],
  },
  'adapter:mssql': {
    name: 'SQL Server Adapter',
    description: 'Production-ready SQL Server database adapter using mssql',
    type: 'database-adapter',
    aliases: ['a:mssql', 'mssql', 'db:mssql'],
    dependencies: ['@zintrust/db-sqlserver'],
    devDependencies: [],
    autoImports: ['@zintrust/db-sqlserver/register'],
    templates: [],
  },
  'adapter:sqlite': {
    name: 'SQLite Adapter',
    description: 'Production-ready SQLite database adapter using better-sqlite3',
    type: 'database-adapter',
    aliases: ['a:sqlite', 'sqlite', 'db:sqlite'],
    dependencies: ['@zintrust/db-sqlite'],
    devDependencies: [],
    autoImports: ['@zintrust/db-sqlite/register'],
    templates: [],
  },
};
