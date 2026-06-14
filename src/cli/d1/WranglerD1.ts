import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { execFileSync } from '@node-singletons/child-process';

import type { IBaseCommand } from '@cli/BaseCommand';

type ApplyOptions = {
  cmd: IBaseCommand;
  dbName: string;
  isLocal: boolean;
  env?: string;
  config?: string;
};

type ExecuteSqlOptions = {
  dbName: string;
  isLocal: boolean;
  sql?: string;
  file?: string;
  cmd?: IBaseCommand;
};

const createWranglerLogMessage = (args: string[]): string => {
  const command = (args[0] as string | undefined) ?? 'wrangler';
  const resource = (args[1] as string | undefined) ?? 'command';
  const action = (args[2] as string | undefined) ?? 'run';
  const target = (args[3] as string | undefined) ?? 'unknown';
  let mode = 'default';

  if (args.includes('--local')) {
    mode = 'local';
  } else if (args.includes('--remote')) {
    mode = 'remote';
  }

  return `[WranglerD1] Executing ${command} ${resource} ${action} for ${target} (${mode})`;
};

const runWrangler = (args: string[], cmd?: IBaseCommand): string => {
  const npmPath = resolveNpmPath();
  const logMessage = createWranglerLogMessage(args);

  if (cmd) {
    cmd.debug(logMessage);
  } else {
    Logger.debug(logMessage);
  }

  return execFileSync(npmPath, ['exec', '--yes', '--', 'wrangler', ...args], {
    stdio: 'pipe',
    encoding: 'utf8',
    env: appConfig.getSafeEnv(),
  });
};

export const WranglerD1 = Object.freeze({
  applyMigrations(opts: ApplyOptions): string {
    const args = ['d1', 'migrations', 'apply', opts.dbName, opts.isLocal ? '--local' : '--remote'];

    if (opts.env !== undefined && opts.env !== null && opts.env.trim() !== '') {
      args.push('--env', opts.env);
    }

    if (opts.config !== undefined && opts.config !== null && opts.config.trim() !== '') {
      args.push('--config', opts.config);
    }

    return runWrangler(args, opts.cmd);
  },

  executeSql(opts: ExecuteSqlOptions): string {
    const args = ['d1', 'execute', opts.dbName, opts.isLocal ? '--local' : '--remote', '--json'];

    if (typeof opts.file === 'string') {
      args.push('--file', opts.file);
    } else if (typeof opts.sql === 'string') {
      args.push('--command', opts.sql);
    } else {
      throw ErrorFactory.createValidationError(
        'Must provide either sql command or file for D1 execution'
      );
    }

    return runWrangler(args, opts.cmd);
  },
});
