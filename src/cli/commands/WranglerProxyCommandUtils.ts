import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { maybeRunProxyWatchMode, parseIntOption } from '@cli/commands/ProxyCommandUtils';
import {
  ensureProxyEntrypoint,
  ensureWranglerConfig,
  resolveConfigPath,
} from '@cli/commands/ProxyScaffoldUtils';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { join } from '@node-singletons/path';
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

      const args = ['dev', '--config', configPath, '--env', input.envName];
      if (port !== undefined) {
        args.push('--port', String(port));
      }

      const exitCode = await SpawnUtil.spawnAndWait({
        command: 'wrangler',
        args,
        env: process.env,
        forwardSignals: false,
      });

      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    },
  });
};
