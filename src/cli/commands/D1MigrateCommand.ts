/**
 * D1 Migrate Command
 * Run Cloudflare D1 migrations using Wrangler
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execSync } from 'node:child_process';

export class D1MigrateCommand extends BaseCommand {
  constructor() {
    super();
    this.name = 'd1:migrate';
    this.description = 'Run Cloudflare D1 migrations';
  }

  protected addOptions(command: Command): void {
    command
      .option('--local', 'Run migrations against local D1 database')
      .option('--remote', 'Run migrations against remote D1 database')
      .option('--database <name>', 'D1 database name', 'zintrust_db');
  }

  async execute(options: CommandOptions): Promise<void> {
    const isLocal = options['local'] === true || options['remote'] !== true;
    const dbName = typeof options['database'] === 'string' ? options['database'] : 'zintrust_db';
    const target = isLocal ? '--local' : '--remote';

    Logger.info(`Running D1 migrations for ${dbName} (${isLocal ? 'local' : 'remote'})...`);

    try {
      // We use wrangler CLI to run D1 migrations
      const command = `npx wrangler d1 migrations apply ${dbName} ${target}`;
      Logger.debug(`Executing: ${command}`);

      const output = execSync(command, { encoding: 'utf8' });
      Logger.info(output);

      Logger.info('✓ D1 migrations completed successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error(`D1 Migration failed: ${message}`);
      const err = error as { stdout?: string; stderr?: string };
      if (err.stdout !== undefined && err.stdout !== '') Logger.info(err.stdout);
      if (err.stderr !== undefined && err.stderr !== '') Logger.error(err.stderr);
      throw error;
    }
  }
}
