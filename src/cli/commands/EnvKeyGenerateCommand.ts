import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as crypto from '@node-singletons/crypto';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import type { Command } from 'commander';

type EnvKeyGenerateOptions = CommandOptions & {
  show?: boolean;
  yes?: boolean;
};

const ENV_KEY_PATTERN = /^[A-Z0-9_]+$/;

const generateRandomKey = (): string => 'base64:' + crypto.randomBytes(32).toString('base64');

const ensureEnvFile = async (envPath: string): Promise<string> => {
  try {
    return await fs.readFile(envPath, 'utf-8');
  } catch (error) {
    Logger.warn('Could not read .env file, attempting to create from example', { error });
    const examplePath = path.resolve(process.cwd(), '.env.example');

    try {
      const exampleContent = await fs.readFile(examplePath, 'utf-8');
      await fs.writeFile(envPath, exampleContent);
      Logger.info('.env file created from .env.example');
      return exampleContent;
    } catch (copyError) {
      Logger.error('Failed to create .env from example', { error: copyError });
      Logger.warn('.env file not found and .env.example not found. Creating new .env file.');
      return '';
    }
  }
};

const readEnvValue = (envContent: string, key: string): string => {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(envContent);
  return match?.[1]?.trim() ?? '';
};

const upsertEnvValue = (envContent: string, key: string, value: string): string => {
  const nextLine = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, 'm');

  if (matcher.test(envContent)) {
    return envContent.replace(matcher, nextLine);
  }

  const trimmed = envContent.trimEnd();
  if (trimmed === '') return `${nextLine}\n`;
  return `${trimmed}\n${nextLine}\n`;
};

const resolveEnvKey = (options: EnvKeyGenerateOptions): string => {
  const envKey = options.args?.[0];
  if (typeof envKey !== 'string' || !ENV_KEY_PATTERN.test(envKey)) {
    throw ErrorFactory.createCliError(
      'A valid env key is required. Use uppercase letters, numbers, and underscores only.'
    );
  }

  return envKey;
};

export const EnvKeyGenerateCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'key:env',
      description: 'Generate or rotate an arbitrary env key',
      addOptions: (command: Command) => {
        command.option('--show', 'Display the generated key instead of modifying files');
        command.option('--yes', 'Overwrite an existing value without prompting');
      },
      execute: async (options: EnvKeyGenerateOptions) => {
        const envKey = resolveEnvKey(options);
        const key = generateRandomKey();

        if (options.show === true) {
          Logger.info(`${envKey}=${key}`);
          return;
        }

        const envPath = path.resolve(process.cwd(), '.env');

        try {
          let envContent = await ensureEnvFile(envPath);
          const currentValue = readEnvValue(envContent, envKey);

          if (currentValue !== '' && options.yes !== true) {
            const confirmed = await PromptHelper.confirm(
              `${envKey} already exists. Override it?`,
              false,
              true
            );

            if (!confirmed) {
              Logger.info(`Skipped updating ${envKey}.`);
              return;
            }
          }

          envContent = upsertEnvValue(envContent, envKey, key);
          await fs.writeFile(envPath, envContent);
          Logger.info(`${envKey} set successfully. [${key}]`);
        } catch (error) {
          Logger.error(`Failed to update ${envKey} in .env`, error);
        }
      },
    });
  },
});

export default EnvKeyGenerateCommand;
