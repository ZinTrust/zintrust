import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { Logger } from '@config/logger';
import { execFileSync } from '@node-singletons/child-process';

import type { IBaseCommand } from '@cli/BaseCommand';

type ApplyOptions = {
  cmd: IBaseCommand;
  dbName: string;
  isLocal: boolean;
};

type ExecuteSqlOptions = {
  dbName: string;
  isLocal: boolean;
  sql: string;
  cmd?: IBaseCommand;
};

const createWranglerLogMessage = (args: string[]): string => {
  const command = args[0] ?? 'wrangler';
  const resource = args[1] ?? 'command';
  const action = args[2] ?? 'run';
  const target = args[3] ?? 'unknown';
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
    return runWrangler(args, opts.cmd);
  },

  executeSql(opts: ExecuteSqlOptions): string {
    const args = [
      'd1',
      'execute',
      opts.dbName,
      opts.isLocal ? '--local' : '--remote',
      '--json',
      '--command',
      opts.sql,
    ];
    return runWrangler(args, opts.cmd);
  },
});
