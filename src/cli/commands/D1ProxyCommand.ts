import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { maybeRunProxyWatchMode } from '@cli/commands/ProxyCommandUtils';
import {
  ensureProxyEntrypoint,
  ensureWranglerConfig,
  findQuotedValue,
  resolveConfigPath,
  trimNonEmptyOption,
} from '@cli/commands/ProxyScaffoldUtils';
import { SpawnUtil } from '@cli/utils/spawn';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { join } from '@node-singletons/path';
import type { Command } from 'commander';

type D1ProxyCommandOptions = CommandOptions & {
  config?: string;
  watch?: boolean;
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

const addOptions = (command: Command): void => {
  command.option('-c, --config <path>', 'Wrangler config file', DEFAULT_CONFIG);
  command.option('--watch', 'Auto-restart proxy on file changes');
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
    return BaseCommand.create({
      name: 'proxy:d1',
      aliases: ['d1:proxy'],
      description:
        'Start the local Cloudflare D1 proxy Worker via Wrangler and scaffold env.d1-proxy in wrangler.jsonc when missing',
      addOptions,
      execute: async (options: D1ProxyCommandOptions): Promise<void> => {
        await maybeRunProxyWatchMode(options.watch);

        const cwd = process.cwd();
        const entrypoint = ensureProxyEntrypoint({
          cwd,
          entryFile: DEFAULT_ENTRY_FILE,
          exportName: 'ZintrustD1Proxy',
          moduleSpecifier: CORE_PROXY_MODULE,
        });
        const configPath = join(cwd, resolveConfigPath(options.config, DEFAULT_CONFIG));
        const result = ensureWranglerConfig({
          configPath,
          options,
          envName: 'd1-proxy',
          resolveValues: resolveConfigValues,
          renderEnvBlock: renderD1ProxyEnvBlock,
          compatibilityDate: DEFAULT_COMPATIBILITY_DATE,
        });

        if (entrypoint.created) {
          Logger.info(`Created ${entrypoint.entryFilePath} from @zintrust/core proxy entrypoint.`);
        }

        if (result.createdFile) {
          Logger.info(`Created ${configPath} with a default d1-proxy environment.`);
        } else if (result.insertedEnv) {
          Logger.info(`Added env.d1-proxy to ${configPath}.`);
        }

        warnOnPlaceholderDatabaseId(result.values);

        const exitCode = await SpawnUtil.spawnAndWait({
          command: 'wrangler',
          args: ['dev', '--config', configPath, '--env', 'd1-proxy'],
          env: process.env,
          forwardSignals: false,
        });

        if (exitCode !== 0) {
          process.exit(exitCode);
        }
      },
    });
  },
});

export default D1ProxyCommand;
