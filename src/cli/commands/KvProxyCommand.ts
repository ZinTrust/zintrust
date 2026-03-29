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
const DEFAULT_ENTRY_FILE = 'src/proxy/kv/ZintrustKvProxy.ts';
const DEFAULT_ROUTE_PATTERN = 'kv-proxy.example.com';
const CORE_PROXY_MODULE = ['@zintrust', 'core', 'proxy'].join('/');

const resolveConfigValues = (
  content: string | undefined,
  options: KvProxyCommandOptions
): KvProxyConfigValues => {
  const fileContent = content ?? '';
  const namespaceId =
    trimNonEmptyOption(options.namespaceId) ??
    trimNonEmptyOption(Env.get('KV_NAMESPACE_ID', '')) ??
    findQuotedValue(fileContent, 'preview_id') ??
    findQuotedValue(fileContent, 'id') ??
    DEFAULT_NAMESPACE_ID;

  return {
    binding:
      trimNonEmptyOption(options.binding) ??
      trimNonEmptyOption(Env.get('KV_NAMESPACE', '')) ??
      findQuotedValue(fileContent, 'KV_NAMESPACE') ??
      findQuotedValue(fileContent, 'binding') ??
      DEFAULT_BINDING,
    namespaceId,
    previewId:
      trimNonEmptyOption(options.previewId) ??
      trimNonEmptyOption(Env.get('KV_NAMESPACE_PREVIEW_ID', '')) ??
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
    '      ],',
    '      // Add routes here when ready:',
    `      // "routes": [{ "pattern": "${DEFAULT_ROUTE_PATTERN}", "custom_domain": true }]`,
    '    }',
  ].join('\n');
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
        const entrypoint = ensureProxyEntrypoint({
          cwd,
          entryFile: DEFAULT_ENTRY_FILE,
          exportName: 'ZintrustKvProxy',
          moduleSpecifier: CORE_PROXY_MODULE,
        });
        const configPath = join(cwd, resolveConfigPath(options.config, DEFAULT_CONFIG));
        const result = ensureWranglerConfig({
          configPath,
          options,
          envName: 'kv-proxy',
          resolveValues: resolveConfigValues,
          renderEnvBlock: renderKvProxyEnvBlock,
          compatibilityDate: DEFAULT_COMPATIBILITY_DATE,
        });

        if (entrypoint.created) {
          Logger.info(`Created ${entrypoint.entryFilePath} from @zintrust/core proxy entrypoint.`);
        }

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
