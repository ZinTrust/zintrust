import type { CommandOptions } from '@zintrust/core/cli';
import { BaseCommand } from '@zintrust/core/cli';
import { execFileSync } from 'node:child_process';
import type { Command } from 'commander';
import {
  cloudflareQueueMigrationStatements,
  cloudflareQueueRollbackStatements,
} from '../migrationSql.js';

type CommandProvider = {
  getCommand: () => Command;
  info(message: string): void;
  success(message: string): void;
};

const addOptions = (command: Command): void => {
  command
    .option('--database <name>', 'Wrangler D1 database binding/name', 'zintrust_db')
    .option('--local', 'Run against local D1 database', true)
    .option('--remote', 'Run against remote D1 database')
    .option('--rollback', 'Drop Cloudflare queue state tables')
    .option('--dry-run', 'Print generated SQL without applying it');
};

const joinStatements = (statements: readonly string[]): string => `${statements.join(';\n')};`;

const runWranglerD1 = (dbName: string, sql: string, remote: boolean): string => {
  const args = ['d1', 'execute', dbName, remote ? '--remote' : '--local', '--command', sql];
  return execFileSync('wrangler', args, { encoding: 'utf-8' });
};

const execute = async (options: CommandOptions, cmd: CommandProvider): Promise<void> => {
  const dbName =
    typeof options['database'] === 'string' && options['database'].trim() !== ''
      ? options['database'].trim()
      : 'zintrust_db';
  const rollback = options['rollback'] === true;
  const remote = options['remote'] === true;
  const statements = rollback
    ? cloudflareQueueRollbackStatements
    : cloudflareQueueMigrationStatements;
  const sql = joinStatements(statements);

  if (options['dryRun'] === true) {
    cmd.info(sql);
    return;
  }

  const output = runWranglerD1(dbName, sql, remote);
  if (output.trim() !== '') cmd.info(output.trim());
  cmd.success(
    rollback
      ? 'Cloudflare queue state tables rolled back.'
      : 'Cloudflare queue state tables migrated.'
  );
};

export const MigrateCloudflareQueueCommand = Object.freeze({
  create(): CommandProvider {
    return BaseCommand.create({
      name: 'migrate:queue-cloudflare',
      description: 'Run @zintrust/queue-cloudflare D1 state migrations',
      aliases: ['queue-cloudflare:migrate'],
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => {
        const command = MigrateCloudflareQueueCommand.create();
        await execute(options, command);
      },
    });
  },
});
