/**
 * Fix Command - Automated Code Cleanup
 * Runs ESLint fix and other automated tools
 */

import { BaseCommand, CommandOptions } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class FixCommand extends BaseCommand {
  protected name = 'fix';
  protected description = 'Run automated code fixes (ESLint, Prettier)';

  protected addOptions(command: Command): void {
    command.option('--dry-run', 'Show what would be fixed without applying changes');
  }

  public async execute(options: CommandOptions): Promise<void> {
    this.info('Starting automated code fixes...');

    try {
      const isDryRun = options['dryRun'] === true;

      this.info('Running ESLint fix...');
      this.runNpmExec([
        'eslint',
        'src',
        '--ext',
        '.ts',
        ...(isDryRun ? ['--fix-dry-run'] : ['--fix']),
      ]);

      this.info('Running Prettier format...');
      this.runNpmExec(['prettier', ...(isDryRun ? ['--check'] : ['--write']), 'src/**/*.ts']);

      this.success('Code fixes completed successfully!');
    } catch (error) {
      Logger.error('Fix command failed', error);
      this.warn('Some fixes could not be applied automatically or linting errors remain.');
      // Don't throw here to allow the user to see the output
    }
  }

  private runNpmExec(args: string[]): void {
    const npmPath = this.resolveNpmPath();

    // Run npm directly (absolute path, no PATH lookup).
    // Provide a fixed PATH comprised of system directories + Node bin (Sonar S4036).
    execFileSync(npmPath, ['exec', '--', ...args], {
      stdio: 'inherit',
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
