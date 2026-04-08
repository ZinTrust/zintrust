import type { IBaseCommand } from '@cli/BaseCommand';
import { findQuotedValue, trimNonEmptyOption } from '@cli/commands/ProxyScaffoldUtils';
import {
  addWranglerProxyBaseOptions,
  createWranglerProxyCommand,
  type WranglerProxyCommandOptions,
} from '@cli/commands/WranglerProxyCommandUtils';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { Command } from 'commander';

type D1ProxyCommandOptions = WranglerProxyCommandOptions & {
  binding?: string;
  databaseName?: string;
  databaseId?: string;
  migrationsDir?: string;
};

type D1ProxyConfigValues = {
  binding: string;
  databaseName: string;
  databaseId: string;
  migrationsDir: string;
};

const DEFAULT_CONFIG = 'wrangler.jsonc';
const DEFAULT_COMPATIBILITY_DATE = '2026-03-12';
const DEFAULT_BINDING = 'ZIN_DB';
const DEFAULT_DATABASE_NAME = 'd1-proxy-db';
const DEFAULT_DATABASE_ID = '<your-d1-database-id>';
const DEFAULT_MIGRATIONS_DIR = 'database/migrations/d1';
const DEFAULT_ENTRY_FILE = 'src/proxy/d1/ZintrustD1Proxy.ts';
const DEFAULT_ROUTE_PATTERN = 'd1-proxy.example.com';
const CORE_PROXY_MODULE = ['@zintrust', 'core', 'proxy'].join('/');

const resolveConfigValues = (
  content: string | undefined,
  options: D1ProxyCommandOptions
): D1ProxyConfigValues => {
  const fileContent = content ?? '';

  return {
    binding:
      trimNonEmptyOption(options.binding) ??
      trimNonEmptyOption(Env.get('D1_BINDING', '')) ??
      findQuotedValue(fileContent, 'D1_BINDING') ??
      findQuotedValue(fileContent, 'binding') ??
      DEFAULT_BINDING,
    databaseName:
      trimNonEmptyOption(options.databaseName) ??
      trimNonEmptyOption(Env.get('D1_DATABASE_NAME', '')) ??
      findQuotedValue(fileContent, 'database_name') ??
      DEFAULT_DATABASE_NAME,
    databaseId:
      trimNonEmptyOption(options.databaseId) ??
      trimNonEmptyOption(Env.get('D1_DATABASE_ID', '')) ??
      findQuotedValue(fileContent, 'database_id') ??
      DEFAULT_DATABASE_ID,
    migrationsDir:
      trimNonEmptyOption(options.migrationsDir) ??
      findQuotedValue(fileContent, 'migrations_dir') ??
      DEFAULT_MIGRATIONS_DIR,
  };
};

const renderD1ProxyEnvBlock = (values: D1ProxyConfigValues): string => {
  return [
    '    "d1-proxy": {',
    '      "name": "zintrust-d1-proxy",',
    '      "main": "./src/proxy/d1/ZintrustD1Proxy.ts",',
    '      "compatibility_flags": ["nodejs_compat"],',
    `      "compatibility_date": "${DEFAULT_COMPATIBILITY_DATE}",`,
    '      "vars": {',
    `        "D1_BINDING": "${values.binding}",`,
    '        "ZT_PROXY_SIGNING_WINDOW_MS": "60000",',
    '        "ZT_MAX_BODY_BYTES": "131072",',
    '        "ZT_MAX_SQL_BYTES": "32768",',
    '        "ZT_MAX_PARAMS": "256",',
    '        "NODE_ENV": "development",',
    String.raw`        "ZT_D1_STATEMENTS_JSON": "{\"health\":\"select 1 as ok\"}"`,
    '      },',
    '      "d1_databases": [',
    '        {',
    `          "binding": "${values.binding}",`,
    `          "database_name": "${values.databaseName}",`,
    `          "database_id": "${values.databaseId}",`,
    `          "migrations_dir": "${values.migrationsDir}"`,
    '        }',
    '      ],',
    '      // Add routes here when ready:',
    `      // "routes": [{ "pattern": "${DEFAULT_ROUTE_PATTERN}", "custom_domain": true }]`,
    '    }',
  ].join('\n');
};

const warnOnPlaceholderDatabaseId = (values: D1ProxyConfigValues): void => {
  if (values.databaseId !== DEFAULT_DATABASE_ID) return;

  Logger.warn(
    'Could not resolve a D1 database id automatically. Update wrangler.jsonc or pass --database-id before relying on the generated d1-proxy environment.'
  );
};

const warnOnMissingSigningSecret = (): void => {
  const directSecret = trimNonEmptyOption(Env.get('D1_REMOTE_SECRET', ''));
  const fallbackSecret = trimNonEmptyOption(Env.get('APP_KEY', ''));
  if (directSecret !== undefined || fallbackSecret !== undefined) return;

  Logger.warn(
    'D1 proxy signing will fail: the resolved project env does not expose D1_REMOTE_SECRET or APP_KEY to the Worker runtime. Signed requests will be rejected with 401 CONFIG_ERROR until one of those keys is set.'
  );
};

const runD1ProxyDiagnostics = (values: D1ProxyConfigValues): void => {
  warnOnPlaceholderDatabaseId(values);
  warnOnMissingSigningSecret();
};

const addOptions = (command: Command): void => {
  addWranglerProxyBaseOptions(command, DEFAULT_CONFIG);
  command.option('--binding <name>', 'D1 binding name', DEFAULT_BINDING);
  command.option('--database-name <name>', 'Cloudflare D1 database name');
  command.option('--database-id <id>', 'Cloudflare D1 database id');
  command.option(
    '--migrations-dir <path>',
    'Cloudflare D1 migrations directory',
    DEFAULT_MIGRATIONS_DIR
  );
};

export const D1ProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return createWranglerProxyCommand<D1ProxyConfigValues, D1ProxyCommandOptions>({
      name: 'proxy:d1',
      aliases: ['d1:proxy'],
      description:
        'Start the local Cloudflare D1 proxy Worker via Wrangler and scaffold env.d1-proxy in wrangler.jsonc when missing',
      envName: 'd1-proxy',
      defaultConfig: DEFAULT_CONFIG,
      compatibilityDate: DEFAULT_COMPATIBILITY_DATE,
      entryFile: DEFAULT_ENTRY_FILE,
      exportName: 'ZintrustD1Proxy',
      moduleSpecifier: CORE_PROXY_MODULE,
      addOptions,
      resolveValues: resolveConfigValues,
      renderEnvBlock: renderD1ProxyEnvBlock,
      afterConfigResolved: runD1ProxyDiagnostics,
    });
  },
});

export default D1ProxyCommand;
