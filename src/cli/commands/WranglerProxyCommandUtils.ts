import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { withWranglerDevVarsSnapshot } from '@cli/cloudflare/CloudflareWranglerDevEnv';
import {
  ensureProxyEnvLoadedForCwd,
  maybeRunProxyWatchMode,
  parseIntOption,
} from '@cli/commands/ProxyCommandUtils';
import {
  ensureProxyEntrypoint,
  ensureWranglerConfig,
  renderProxyWranglerDevConfig,
  resolveConfigPath,
} from '@cli/commands/ProxyScaffoldUtils';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { mkdirSync, writeFileSync } from '@node-singletons/fs';
import { dirname, join } from '@node-singletons/path';
import type { Command } from 'commander';

export type WranglerProxyCommandOptions = CommandOptions & {
  config?: string;
  port?: string;
  watch?: boolean;
};

type CreateWranglerProxyCommandInput<TValues, TOptions extends WranglerProxyCommandOptions> = {
  name: string;
  aliases: string[];
  description: string;
  envName: string;
  defaultConfig: string;
  compatibilityDate: string;
  entryFile: string;
  exportName: string;
  moduleSpecifier: string;
  addOptions: (command: Command) => void;
  resolveValues: (content: string | undefined, options: TOptions) => TValues;
  renderEnvBlock: (values: TValues) => string;
  afterConfigResolved?: (values: TValues) => void;
};

export const addWranglerProxyBaseOptions = (command: Command, defaultConfig: string): void => {
  command.option('-c, --config <path>', 'Wrangler config file', defaultConfig);
  command.option('--port <port>', 'Local Wrangler dev port');
  command.option('--watch', 'Auto-restart proxy on file changes');
};

const toRootedProxyConfigContent = (content: string): string => {
  return content.replaceAll('": "../../', '": "./');
};

export const createWranglerProxyCommand = <TValues, TOptions extends WranglerProxyCommandOptions>(
  input: CreateWranglerProxyCommandInput<TValues, TOptions>
): IBaseCommand => {
  return BaseCommand.create({
    name: input.name,
    aliases: input.aliases,
    description: input.description,
    addOptions: input.addOptions,
    execute: async (options: CommandOptions): Promise<void> => {
      const typedOptions = options as TOptions;

      await maybeRunProxyWatchMode(typedOptions.watch);

      const port = parseIntOption(typedOptions.port, 'port');
      const cwd = process.cwd();
      const projectRoot = ensureProxyEnvLoadedForCwd(cwd);

      const entrypoint = ensureProxyEntrypoint({
        cwd,
        entryFile: input.entryFile,
        exportName: input.exportName,
        moduleSpecifier: input.moduleSpecifier,
      });
      const configPath = join(cwd, resolveConfigPath(typedOptions.config, input.defaultConfig));
      const result = ensureWranglerConfig({
        configPath,
        options: typedOptions,
        envName: input.envName,
        resolveValues: input.resolveValues,
        renderEnvBlock: input.renderEnvBlock,
        compatibilityDate: input.compatibilityDate,
      });

      if (entrypoint.created) {
        Logger.info(`Created ${entrypoint.entryFilePath} from @zintrust/core proxy entrypoint.`);
      }

      if (result.createdFile) {
        Logger.info(`Created ${configPath} with a default ${input.envName} environment.`);
      } else if (result.insertedEnv) {
        Logger.info(`Added env.${input.envName} to ${configPath}.`);
      }

      input.afterConfigResolved?.(result.values);

      const proxyConfigContent = renderProxyWranglerDevConfig(result.content, input.envName);
      const proxyConfigDir = cwd;
      const proxyConfigPath = join(proxyConfigDir, `.zin.proxy.${input.envName}.jsonc`);

      if (proxyConfigContent !== undefined) {
        mkdirSync(proxyConfigDir, { recursive: true });
        writeFileSync(proxyConfigPath, toRootedProxyConfigContent(proxyConfigContent), 'utf-8');
      }

      const wranglerRunConfigPath = proxyConfigContent === undefined ? configPath : proxyConfigPath;
      const wranglerDevVarsCwd = proxyConfigContent === undefined ? cwd : dirname(proxyConfigPath);
      const wranglerDevVarsEnvName = proxyConfigContent === undefined ? input.envName : '';

      const args = ['dev', '--config', wranglerRunConfigPath];
      if (port !== undefined) {
        args.push('--port', String(port));
      }

      const exitCode = await withWranglerDevVarsSnapshot(
        {
          cwd: wranglerDevVarsCwd,
          projectRoot,
          envName: wranglerDevVarsEnvName,
          configPath,
          runtimeEnv: process.env,
        },
        async () => {
          return SpawnUtil.spawnAndWait({
            command: 'wrangler',
            args,
            env: process.env,
            forwardSignals: false,
          });
        }
      );

      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    },
  });
};
