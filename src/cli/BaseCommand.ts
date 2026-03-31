/**
 * Base Command - Abstract Command Class
 * All CLI commands extend this class
 */

import { SystemDebuggerBridge } from '@/debugger/SystemDebuggerBridge';
import { ErrorHandler } from '@cli/ErrorHandler';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Command } from 'commander';

export interface CommandOptions {
  verbose?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export interface IBaseCommand {
  [x: string]: unknown;
  name: string;
  description: string;
  verbose?: boolean;
  getCommand(): Command;
  addOptions?: (command: Command) => void;
  execute(options: CommandOptions): void | Promise<void>;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  debug(message: unknown): void;
}

const toCommandArguments = (options: CommandOptions): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => typeof value !== 'function')
  );
};

/**
 * Command Factory Helper
 * Sealed namespace for immutability
 */
export const BaseCommand = Object.freeze({
  /**
   * Create a command instance with common logic
   */
  create<T extends IBaseCommand = IBaseCommand>(config: {
    name: string;
    description: string;
    /** Optional alias or aliases for the command (e.g. 'make:mail') */
    aliases?: string | string[];
    addOptions?: (command: Command) => void;
    execute: (options: CommandOptions) => void | Promise<void>;
  }): T {
    const getCommand = (): Command => {
      const command = new Command(config.name);
      command.description(config.description);
      command.option('--verbose', 'Enable verbose output');

      if (typeof config.aliases === 'string' && config.aliases.length > 0) {
        command.alias(config.aliases);
      }

      if (Array.isArray(config.aliases)) {
        for (const alias of config.aliases) {
          if (typeof alias === 'string' && alias.length > 0) {
            command.alias(alias);
          }
        }
      }

      // Add custom options
      if (config.addOptions) {
        config.addOptions(command);
      }

      // Set action handler
      command.action(async (...args: unknown[]) => {
        const options = args.at(-2) as CommandOptions;
        const commandArgs = args.slice(0, -2) as string[];
        options.args = commandArgs;
        const startedAt = Date.now();

        try {
          await config.execute(options);
          SystemDebuggerBridge.emitCommand(
            config.name,
            toCommandArguments(options),
            0,
            Date.now() - startedAt
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          SystemDebuggerBridge.emitCommand(
            config.name,
            toCommandArguments(options),
            1,
            Date.now() - startedAt,
            message
          );

          if (error instanceof Error) {
            ErrorFactory.createTryCatchError('Command execution failed', error);
            ErrorHandler.handle(error, undefined, false);
            return;
          }

          const wrapped = ErrorFactory.createTryCatchError('Command execution failed', error);
          ErrorHandler.handle(wrapped, undefined, false);
        }
      });

      return command;
    };

    const base: IBaseCommand = {
      name: config.name,
      description: config.description,
      verbose: false,
      addOptions: config.addOptions,
      getCommand,
      execute: config.execute,
      info: (msg: string) => ErrorHandler.info(msg),
      success: (msg: string) => ErrorHandler.success(msg),
      warn: (msg: string) => ErrorHandler.warn(msg),
      debug: (msg: string) => ErrorHandler.debug(msg, true),
    };

    return base as T;
  },
});
