/**
 * Bulletproof Signing Secret Generate Command
 * Generates and sets BULLETPROOF_SIGNING_SECRET (with rotation backups)
 */

import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import * as crypto from '@node-singletons/crypto';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import type { Command } from 'commander';

type BulletproofKeyOptions = CommandOptions & {
  show?: boolean;
  maxBackups?: string;
};

const ENV_KEY = 'BULLETPROOF_SIGNING_SECRET';
const ENV_BK_KEY = 'BULLETPROOF_SIGNING_SECRET_BK';

export const BulletproofKeyGenerateCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'key:bulletproof',
      description: 'Generate/rotate BULLETPROOF_SIGNING_SECRET (signed-request proof key)',
      aliases: ['bulletproof:key', 'key:signer'],
      addOptions: (command: Command) => {
        command.option('--show', 'Display the key (and suggested env) instead of modifying files');
        command.option(
          '--max-backups <n>',
          'Max secrets to keep in BULLETPROOF_SIGNING_SECRET_BK (default: 5)',
          '5'
        );
      },
      execute: async (options: BulletproofKeyOptions) => {
        const key = generateRandomKey();
        const maxBackups = parseMaxBackups(options.maxBackups);

        if (options.show === true) {
          Logger.info(`${ENV_KEY}=${key}`);
          Logger.info(`${ENV_BK_KEY}=[]`);
          return;
        }

        const envPath = path.resolve(process.cwd(), '.env');

        try {
          let envContent = '';

          try {
            envContent = await fs.readFile(envPath, 'utf-8');
          } catch (error) {
            Logger.warn('Could not read .env file, attempting to create from example', { error });
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
              envContent = '';
            }
          }

          const currentSecret = readEnvLineValue(envContent, ENV_KEY);
          const currentBackups = parseBackups(readEnvLineValue(envContent, ENV_BK_KEY));

          const nextBackups = rotateBackups({
            currentSecret,
            currentBackups,
            maxBackups,
          });

          envContent = upsertEnvLine(envContent, ENV_BK_KEY, JSON.stringify(nextBackups));
          envContent = upsertEnvLine(envContent, ENV_KEY, key);

          await fs.writeFile(envPath, envContent);
          Logger.info(`Bulletproof signing secret set successfully in ${envPath} (value hidden)`);
        } catch (error) {
          Logger.error('Failed to update .env file', error);
        }
      },
    });
  },
});

const parseMaxBackups = (raw: unknown): number => {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return 5;
  return Math.min(50, n);
};

const generateRandomKey = (): string => {
  // 32 bytes = 256-bit (same as APP_KEY default strength).
  return 'base64:' + crypto.randomBytes(32).toString('base64');
};

const readEnvLineValue = (envContent: string, key: string): string => {
  const re = new RegExp(`^${escapeRegExp(key)}=(.*)$`, 'm');
  const match = re.exec(envContent);
  return typeof match?.[1] === 'string' ? match[1].trim() : '';
};

const upsertEnvLine = (envContent: string, key: string, value: string): string => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');
  if (re.test(envContent)) {
    return envContent.replace(re, line);
  }

  const trimmed = envContent.trimEnd();
  if (trimmed === '') return `${line}\n`;
  return `${trimmed}\n${line}\n`;
};

const escapeRegExp = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const parseBackups = (raw: string): string[] => {
  const value = raw.trim();
  if (value === '') return [];

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((v): v is string => typeof v === 'string')
        .map((s) => s.trim())
        .filter((s) => s !== '');
    } catch {
      return [];
    }
  }

  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
};

const rotateBackups = (params: {
  currentSecret: string;
  currentBackups: string[];
  maxBackups: number;
}): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];

  const pushUnique = (secret: string): void => {
    const s = secret.trim();
    if (s === '') return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  if (params.currentSecret !== '') {
    pushUnique(params.currentSecret);
  }

  for (const s of params.currentBackups) {
    pushUnique(s);
  }

  return out.slice(0, Math.max(0, params.maxBackups));
};

export default BulletproofKeyGenerateCommand;
