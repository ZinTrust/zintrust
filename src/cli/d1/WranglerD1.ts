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

const runWrangler = (args: string[], cmd?: IBaseCommand): string => {
  const npmPath = resolveNpmPath();
  const printable = `npm exec --yes -- wrangler ${args.join(' ')}`;

  if (cmd) {
    cmd.debug(`Executing: ${printable}`);
  } else {
    Logger.debug(`[WranglerD1] Executing: ${printable}`);
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
