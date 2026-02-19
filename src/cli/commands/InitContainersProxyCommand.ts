import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

const WRANGLER_CONTAINERS_PROXY_TEMPLATE = `/**
 * ============================================================================
 * ZinTrust Cloudflare Containers Proxy
 * ============================================================================
 * This Worker acts as the "gateway" for the DB/KV/SMTP proxy stack.
 *
 * Requests are routed by path prefix:
 *   /mysql/*     -> ZintrustMySqlProxyContainer (port 8789)
 *   /postgres/*  -> ZintrustPostgresProxyContainer (port 8790)
 *   /redis/*     -> ZintrustRedisProxyContainer (port 8791)
 *   /mongodb/*   -> ZintrustMongoDbProxyContainer (port 8792)
 *   /sqlserver/* -> ZintrustSqlServerProxyContainer (port 8793)
 *   /smtp/*      -> ZintrustSmtpProxyContainer (port 8794)
 *
 * Notes:
 * - You must install the runtime package: "@zintrust/cloudflare-containers-proxy".
 * - Secrets should be uploaded with the same config file.
 * ============================================================================
 */

{
  "name": "zintrust-containers-proxy",
  "main": "./src/containers-proxy.ts",

  "compatibility_date": "2025-04-21",
  "compatibility_flags": ["nodejs_compat"],

  "workers_dev": true,
  "minify": false,

  "containers": [
    { "class_name": "ZintrustMySqlProxyContainer", "image": "./Dockerfile", "max_instances": 10 },
    { "class_name": "ZintrustPostgresProxyContainer", "image": "./Dockerfile", "max_instances": 10 },
    { "class_name": "ZintrustRedisProxyContainer", "image": "./Dockerfile", "max_instances": 10 },
    { "class_name": "ZintrustMongoDbProxyContainer", "image": "./Dockerfile", "max_instances": 10 },
    { "class_name": "ZintrustSqlServerProxyContainer", "image": "./Dockerfile", "max_instances": 10 },
    { "class_name": "ZintrustSmtpProxyContainer", "image": "./Dockerfile", "max_instances": 10 }
  ],

  "durable_objects": {
    "bindings": [
      { "name": "ZT_PROXY_MYSQL", "class_name": "ZintrustMySqlProxyContainer" },
      { "name": "ZT_PROXY_POSTGRES", "class_name": "ZintrustPostgresProxyContainer" },
      { "name": "ZT_PROXY_REDIS", "class_name": "ZintrustRedisProxyContainer" },
      { "name": "ZT_PROXY_MONGODB", "class_name": "ZintrustMongoDbProxyContainer" },
      { "name": "ZT_PROXY_SQLSERVER", "class_name": "ZintrustSqlServerProxyContainer" },
      { "name": "ZT_PROXY_SMTP", "class_name": "ZintrustSmtpProxyContainer" }
    ]
  },

  "migrations": [
    {
      "tag": "containers-proxy-v1",
      "new_sqlite_classes": [
        "ZintrustMySqlProxyContainer",
        "ZintrustPostgresProxyContainer",
        "ZintrustRedisProxyContainer",
        "ZintrustMongoDbProxyContainer",
        "ZintrustSqlServerProxyContainer",
        "ZintrustSmtpProxyContainer"
      ]
    }
  ],

  "env": {
    "staging": {
      "name": "zintrust-containers-proxy-staging",
      "minify": false,
      "vars": {
        "ENVIRONMENT": "staging",
        "APP_NAME": "ZinTrust",
        "CSRF_SKIP_PATHS": "/api/*,/queue-monitor/*"
      },
      // Add routes here when ready:
      // "routes": [{ "pattern": "proxy-staging.example.com", "custom_domain": true }]
    },
    "production": {
      "name": "zintrust-containers-proxy-production",
      "minify": true,
      "vars": {
        "ENVIRONMENT": "production",
        "APP_NAME": "ZinTrust",
        "CSRF_SKIP_PATHS": "/api/*,/queue-monitor/*"
      },
      // Add routes here when ready:
      // "routes": [{ "pattern": "proxy.example.com", "custom_domain": true }]
    }
  }
}
`;

const WORKER_ENTRY_TEMPLATE = `export { default } from '@zintrust/cloudflare-containers-proxy';
export * from '@zintrust/cloudflare-containers-proxy';
`;

const backupSuffix = (): string => new Date().toISOString().replaceAll(/[:.]/g, '-');

const backupFileIfExists = (filePath: string): void => {
  if (!existsSync(filePath)) return;
  const backupPath = `${filePath}.bak.${backupSuffix()}`;
  copyFileSync(filePath, backupPath);
  Logger.info(`🗂️ Backup created: ${backupPath}`);
};

async function writeWranglerConfig(cwd: string): Promise<void> {
  const configPath = join(cwd, 'wrangler.containers-proxy.jsonc');

  let shouldWrite = true;
  if (existsSync(configPath)) {
    shouldWrite = await PromptHelper.confirm(
      'wrangler.containers-proxy.jsonc already exists. Overwrite?',
      false
    );
  }

  if (!shouldWrite) {
    Logger.info('Skipped wrangler.containers-proxy.jsonc');
    return;
  }

  backupFileIfExists(configPath);
  writeFileSync(configPath, WRANGLER_CONTAINERS_PROXY_TEMPLATE);
  Logger.info('✅ Created wrangler.containers-proxy.jsonc');
}

async function writeWorkerEntry(cwd: string): Promise<void> {
  const srcDir = join(cwd, 'src');
  const entryPath = join(srcDir, 'containers-proxy.ts');

  if (!existsSync(srcDir)) {
    mkdirSync(srcDir, { recursive: true });
  }

  let shouldWrite = true;
  if (existsSync(entryPath)) {
    shouldWrite = await PromptHelper.confirm(
      'src/containers-proxy.ts already exists. Overwrite?',
      false
    );
  }

  if (!shouldWrite) {
    Logger.info('Skipped src/containers-proxy.ts');
    return;
  }

  backupFileIfExists(entryPath);
  writeFileSync(entryPath, WORKER_ENTRY_TEMPLATE);
  Logger.info('✅ Created src/containers-proxy.ts');
}

export const InitContainersProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:containers-proxy',
      aliases: ['init:ccp', 'init:cf-containers-proxy'],
      description: 'Scaffold Cloudflare Containers proxy Worker (wrangler.containers-proxy.jsonc)',
      async execute(): Promise<void> {
        Logger.info('Initializing Cloudflare Containers proxy scaffolding...');

        const cwd = process.cwd();
        await writeWranglerConfig(cwd);
        await writeWorkerEntry(cwd);

        Logger.info('✅ Containers proxy scaffolding complete.');
        Logger.info('Install runtime: npm i @zintrust/cloudflare-containers-proxy');
        Logger.info(
          'Dev (Wrangler + Docker): zin docker --wrangler-config wrangler.containers-proxy.jsonc --env staging'
        );
        Logger.info('Dev (short): zin dk -e staging');
        Logger.info('Deploy (short): zin d:ccp');
        await Promise.resolve();
      },
    });
  },
});
