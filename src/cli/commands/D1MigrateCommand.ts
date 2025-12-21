/**
 * D1 Migrate Command
 * Run Cloudflare D1 migrations using Wrangler
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
      const output = this.runWrangler(['d1', 'migrations', 'apply', dbName, target]);
      if (output !== '') Logger.info(output);

      Logger.info('✓ D1 migrations completed successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error(`D1 Migration failed: ${message}`);
      const err = error as { stdout?: Buffer; stderr?: Buffer };
      if (err.stdout !== undefined && err.stdout.length > 0) Logger.info(err.stdout.toString());
      if (err.stderr !== undefined && err.stderr.length > 0) Logger.error(err.stderr.toString());
      throw error;
    }
  }

  private runWrangler(args: string[]): string {
    const npmPath = this.resolveNpmPath();

    // Mirror `npx wrangler ...` via `npm exec --yes -- wrangler ...` without PATH lookup.
    // Run npm via absolute path (no PATH-based resolution).
    Logger.debug(`Executing: npm exec --yes -- wrangler ${args.join(' ')}`);
    return execFileSync(npmPath, ['exec', '--yes', '--', 'wrangler', ...args], {
      stdio: 'pipe',
      encoding: 'utf8',
      env: this.getSafeEnv(),
    });
  }

  private resolveNpmPath(): string {
    const nodeBinDir = path.dirname(process.execPath);

    const candidates =
      process.platform === 'win32'
        ? [path.join(nodeBinDir, 'npm.cmd'), path.join(nodeBinDir, 'npm.exe')]
        : [path.join(nodeBinDir, 'npm')];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    throw new Error(
      'Unable to locate npm executable. Ensure Node.js (with npm) is installed in the standard location.'
    );
  }

  private getSafeEnv(): NodeJS.ProcessEnv {
    // Build a fixed, unwriteable PATH that includes Node's directory (Sonar S4036).
    const nodeBinDir = path.dirname(process.execPath);
    const safePath =
      process.platform === 'win32'
        ? [String.raw`C:\Windows\System32`, String.raw`C:\Windows`, nodeBinDir].join(';')
        : ['/usr/bin', '/bin', '/usr/sbin', '/sbin', nodeBinDir].join(':');

    return {
      ...process.env,
      PATH: safePath,
      npm_config_scripts_prepend_node_path: 'true',
    };
  }
}
