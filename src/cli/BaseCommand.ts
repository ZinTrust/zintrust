/**
 * Base Command - Abstract Command Class
 * All CLI commands extend this class
 */

import { ErrorHandler } from '@cli/ErrorHandler';
import { Logger } from '@config/logger';
import { Command } from 'commander';

export interface CommandOptions {
  verbose?: boolean;
  args?: string[];
  [key: string]: unknown;
}

export interface IBaseCommand {
  name: string;
  description: string;
  verbose?: boolean;
  getCommand(): Command;
  addOptions?: (command: Command) => void;
  execute(options: CommandOptions): Promise<void>;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  debug(message: unknown): void;
}

/**
 * Command Factory Helper
 * Sealed namespace for immutability
 */
export const BaseCommand = Object.freeze({
  /**
   * Create a command instance with common logic
   */
  create(config: {
    name: string;
    description: string;
    addOptions?: (command: Command) => void;
    execute: (options: CommandOptions) => Promise<void>;
  }): IBaseCommand {
    const getCommand = (): Command => {
      const command = new Command(config.name);
      command.description(config.description);
      command.option('-v, --verbose', 'Enable verbose output');

      // Add custom options
      if (config.addOptions) {
        config.addOptions(command);
      }

      // Set action handler
      command.action(async (...args: unknown[]) => {
        const options = args.at(-2) as CommandOptions;
        const commandArgs = args.slice(0, -2) as string[];
        options.args = commandArgs;

        try {
          await config.execute(options);
        } catch (error) {
          Logger.error('Command execution failed', error);
          ErrorHandler.handle(error as Error);
        }
      });

      return command;
    };

    return {
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
  },
});
