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

type KvProxyCommandOptions = CommandOptions & {
  config?: string;
  watch?: boolean;
  binding?: string;
  namespaceId?: string;
  previewId?: string;
};

type KvProxyConfigValues = {
  binding: string;
  namespaceId: string;
  previewId: string;
};

const DEFAULT_CONFIG = 'wrangler.jsonc';
const DEFAULT_COMPATIBILITY_DATE = '2026-03-12';
const DEFAULT_BINDING = 'ZIN_KV';
const DEFAULT_NAMESPACE_ID = '<your-kv-namespace-id>';

const trimOption = (value: string | undefined): string | undefined => {
  if (!isNonEmptyString(value)) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveConfigPath = (raw: string | undefined): string => trimOption(raw) ?? DEFAULT_CONFIG;

const findQuotedValue = (content: string, key: string): string | undefined => {
  const pattern = new RegExp(String.raw`"${key}"\s*:\s*"([^"]+)"`);
  const match = pattern.exec(content);
  return trimOption(match?.[1]);
};

const resolveConfigValues = (
  content: string | undefined,
  options: KvProxyCommandOptions
): KvProxyConfigValues => {
  const fileContent = content ?? '';
  const namespaceId =
    trimOption(options.namespaceId) ??
    trimOption(Env.get('KV_NAMESPACE_ID', '')) ??
    findQuotedValue(fileContent, 'preview_id') ??
    findQuotedValue(fileContent, 'id') ??
    DEFAULT_NAMESPACE_ID;

  return {
    binding:
      trimOption(options.binding) ??
      trimOption(Env.get('KV_NAMESPACE', '')) ??
      findQuotedValue(fileContent, 'KV_NAMESPACE') ??
      findQuotedValue(fileContent, 'binding') ??
      DEFAULT_BINDING,
    namespaceId,
    previewId:
      trimOption(options.previewId) ??
      trimOption(Env.get('KV_NAMESPACE_PREVIEW_ID', '')) ??
      findQuotedValue(fileContent, 'preview_id') ??
      namespaceId,
  };
};

const renderKvProxyEnvBlock = (values: KvProxyConfigValues): string => {
  return [
    '    "kv-proxy": {',
    '      "name": "zintrust-kv-proxy",',
    '      "main": "./src/proxy/kv/ZintrustKvProxy.ts",',
    '      "compatibility_flags": ["nodejs_compat"],',
    `      "compatibility_date": "${DEFAULT_COMPATIBILITY_DATE}",`,
    '      "vars": {',
    `        "KV_NAMESPACE": "${values.binding}",`,
    '        "NODE_ENV": "development"',
    '      },',
    '      "kv_namespaces": [',
    '        {',
    `          "binding": "${values.binding}",`,
    `          "id": "${values.namespaceId}",`,
    `          "preview_id": "${values.previewId}",`,
    '          "remote": false',
    '        }',
    '      ]',
    '    }',
  ].join('\n');
};

const renderDefaultWranglerConfig = (values: KvProxyConfigValues): string => {
  return [
    '{',
    '  "name": "zintrust-api",',
    '  "main": "./src/functions/cloudflare.ts",',
    `  "compatibility_date": "${DEFAULT_COMPATIBILITY_DATE}",`,
    '  "compatibility_flags": ["nodejs_compat"],',
    '  "env": {',
    renderKvProxyEnvBlock(values),
    '  }',
    '}',
    '',
  ].join('\n');
};

const injectEnvBlock = (content: string, block: string): string => {
  if (/"kv-proxy"\s*:\s*\{/.test(content)) return content;

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
  options: KvProxyCommandOptions
): { createdFile: boolean; insertedEnv: boolean; values: KvProxyConfigValues } => {
  if (!existsSync(configPath)) {
    const values = resolveConfigValues(undefined, options);
    writeFileSync(configPath, renderDefaultWranglerConfig(values), 'utf-8');
    return { createdFile: true, insertedEnv: true, values };
  }

  const content = readFileSync(configPath, 'utf-8');
  const values = resolveConfigValues(content, options);
  const next = injectEnvBlock(content, renderKvProxyEnvBlock(values));

  if (next !== content) {
    writeFileSync(configPath, next, 'utf-8');
    return { createdFile: false, insertedEnv: true, values };
  }

  return { createdFile: false, insertedEnv: false, values };
};

const warnOnPlaceholderNamespaceId = (values: KvProxyConfigValues): void => {
  if (values.namespaceId !== DEFAULT_NAMESPACE_ID) return;

  Logger.warn(
    'Could not resolve a KV namespace id automatically. Update wrangler.jsonc or pass --namespace-id before relying on the generated kv-proxy environment.'
  );
};

const addOptions = (command: Command): void => {
  command.option('-c, --config <path>', 'Wrangler config file', DEFAULT_CONFIG);
  command.option('--watch', 'Auto-restart proxy on file changes');
  command.option('--binding <name>', 'KV binding name', DEFAULT_BINDING);
  command.option('--namespace-id <id>', 'Cloudflare KV namespace id');
  command.option('--preview-id <id>', 'Cloudflare KV preview namespace id');
};

export const KvProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'proxy:kv',
      aliases: ['kv:proxy'],
      description:
        'Start the local Cloudflare KV proxy Worker via Wrangler and scaffold env.kv-proxy in wrangler.jsonc when missing',
      addOptions,
      execute: async (options: KvProxyCommandOptions): Promise<void> => {
        await maybeRunProxyWatchMode(options.watch);

        const cwd = process.cwd();
        const configPath = join(cwd, resolveConfigPath(options.config));
        const result = ensureWranglerConfig(configPath, options);

        if (result.createdFile) {
          Logger.info(`Created ${configPath} with a default kv-proxy environment.`);
        } else if (result.insertedEnv) {
          Logger.info(`Added env.kv-proxy to ${configPath}.`);
        }

        warnOnPlaceholderNamespaceId(result.values);

        const exitCode = await SpawnUtil.spawnAndWait({
          command: 'wrangler',
          args: ['dev', '--config', configPath, '--env', 'kv-proxy'],
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

export default KvProxyCommand;
