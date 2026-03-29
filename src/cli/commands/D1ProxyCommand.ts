import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { maybeRunProxyWatchMode } from '@cli/commands/ProxyCommandUtils';
import { SpawnUtil } from '@cli/utils/spawn';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { existsSync, readFileSync, writeFileSync } from '@node-singletons/fs';
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

const trimOption = (value: string | undefined): string | undefined => {
  if (!isNonEmptyString(value)) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveConfigPath = (raw: string | undefined): string => {
  const trimmed = trimOption(raw);
  return trimmed ?? DEFAULT_CONFIG;
};

const findQuotedValue = (content: string, key: string): string | undefined => {
  const pattern = new RegExp(String.raw`"${key}"\s*:\s*"([^"]+)"`);
  const match = pattern.exec(content);
  return trimOption(match?.[1]);
};

const resolveConfigValues = (
  content: string | undefined,
  options: D1ProxyCommandOptions
): D1ProxyConfigValues => {
  const fileContent = content ?? '';

  return {
    binding:
      trimOption(options.binding) ??
      trimOption(Env.get('D1_BINDING', '')) ??
      findQuotedValue(fileContent, 'D1_BINDING') ??
      findQuotedValue(fileContent, 'binding') ??
      DEFAULT_BINDING,
    databaseName:
      trimOption(options.databaseName) ??
      trimOption(Env.get('D1_DATABASE_NAME', '')) ??
      findQuotedValue(fileContent, 'database_name') ??
      DEFAULT_DATABASE_NAME,
    databaseId:
      trimOption(options.databaseId) ??
      trimOption(Env.get('D1_DATABASE_ID', '')) ??
      findQuotedValue(fileContent, 'database_id') ??
      DEFAULT_DATABASE_ID,
    migrationsDir:
      trimOption(options.migrationsDir) ??
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
    '      ]',
    '    }',
  ].join('\n');
};

const renderDefaultWranglerConfig = (values: D1ProxyConfigValues): string => {
  return [
    '{',
    '  "name": "zintrust-api",',
    '  "main": "./src/functions/cloudflare.ts",',
    `  "compatibility_date": "${DEFAULT_COMPATIBILITY_DATE}",`,
    '  "compatibility_flags": ["nodejs_compat"],',
    '  "env": {',
    renderD1ProxyEnvBlock(values),
    '  }',
    '}',
    '',
  ].join('\n');
};

const injectEnvBlock = (content: string, block: string): string => {
  if (/"d1-proxy"\s*:\s*\{/.test(content)) return content;

  if (/"env"\s*:\s*\{\s*\}/m.test(content)) {
    return content.replace(/"env"\s*:\s*\{\s*\}/m, `"env": {\n${block}\n  }`);
  }

  if (/"env"\s*:\s*\{/m.test(content)) {
    return content.replace(/"env"\s*:\s*\{/m, (match) => `${match}\n${block},`);
  }

  const closingIndex = content.lastIndexOf('}');
  if (closingIndex < 0) {
    throw ErrorFactory.createCliError('Invalid wrangler.jsonc: missing closing brace.');
  }

  const before = content.slice(0, closingIndex).trimEnd();
  const suffix = before.endsWith('{') ? '\n' : ',\n';
  return `${before}${suffix}  "env": {\n${block}\n  }\n}\n`;
};

const ensureWranglerConfig = (
  configPath: string,
  options: D1ProxyCommandOptions
): { createdFile: boolean; insertedEnv: boolean; values: D1ProxyConfigValues } => {
  if (!existsSync(configPath)) {
    const values = resolveConfigValues(undefined, options);
    writeFileSync(configPath, renderDefaultWranglerConfig(values), 'utf-8');
    return { createdFile: true, insertedEnv: true, values };
  }

  const content = readFileSync(configPath, 'utf-8');
  const values = resolveConfigValues(content, options);
  const next = injectEnvBlock(content, renderD1ProxyEnvBlock(values));

  if (next !== content) {
    writeFileSync(configPath, next, 'utf-8');
    return { createdFile: false, insertedEnv: true, values };
  }

  return { createdFile: false, insertedEnv: false, values };
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
        const configPath = join(cwd, resolveConfigPath(options.config));
        const result = ensureWranglerConfig(configPath, options);

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
