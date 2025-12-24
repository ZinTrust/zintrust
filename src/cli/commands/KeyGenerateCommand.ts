/**
 * Key Generate Command
 * Generates and sets the application key
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import * as crypto from '@node-singletons/crypto';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { Command } from 'commander';

export const KeyGenerateCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'key:generate',
      description: 'Set the application key',
      addOptions: (command: Command) => {
        command.option('--show', 'Display the key instead of modifying files');
        command.option('--force', 'Force the operation to run when in production');
      },
      execute: async (options: CommandOptions) => {
        const key = generateRandomKey();

        if (options['show'] === true) {
          Logger.info(`Application key: [${key}]`);
          return;
        }

        const envPath = path.resolve(process.cwd(), '.env');

        try {
          let envContent = '';
          try {
            envContent = await fs.readFile(envPath, 'utf-8');
          } catch (error) {
            Logger.warn('Could not read .env file, attempting to create from example', { error });
            // If .env doesn't exist, try to copy .env.example
            const examplePath = path.resolve(process.cwd(), '.env.example');
            try {
              envContent = await fs.readFile(examplePath, 'utf-8');
              await fs.writeFile(envPath, envContent);
              Logger.info('.env file created from .env.example');
            } catch (copyError) {
              Logger.error('Failed to create .env from example', { error: copyError });
              Logger.warn(
                '.env file not found and .env.example not found. Creating new .env file.'
              );
            }
          }

          // Backup existing key if present
          const appKeyMatch = /^APP_KEY=(.*)$/m.exec(envContent);
          const currentKey = appKeyMatch?.[1]?.trim();

          if (currentKey !== undefined && currentKey.length > 0) {
            const oldKey = currentKey;

            if (envContent.includes('APP_KEY_BK=')) {
              envContent = envContent.replace(/^APP_KEY_BK=.*$/m, `APP_KEY_BK=${oldKey}`);
            } else {
              envContent += `\nAPP_KEY_BK=${oldKey}`;
            }
          }

          if (envContent.includes('APP_KEY=')) {
            const regex = /^APP_KEY=.*/m;
            envContent = envContent.replace(regex, `APP_KEY=${key}`);
          } else {
            envContent += `\nAPP_KEY=${key}\n`;
          }

          await fs.writeFile(envPath, envContent);
          Logger.info(`Application key set successfully. [${key}]`);
        } catch (error) {
          Logger.error('Failed to update .env file', error);
        }
      },
    });
  },
});

function generateRandomKey(): string {
  return 'base64:' + crypto.randomBytes(32).toString('base64');
}
