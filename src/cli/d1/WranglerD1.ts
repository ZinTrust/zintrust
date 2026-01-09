import { resolveNpmPath } from '@common/index';
import { appConfig } from '@config/app';
import { execFileSync } from '@node-singletons/child-process';

import type { IBaseCommand } from '@cli/BaseCommand';

type ApplyOptions = {
  cmd: IBaseCommand;
  dbName: string;
  isLocal: boolean;
};

export const WranglerD1 = Object.freeze({
  applyMigrations(opts: ApplyOptions): string {
    const args = ['d1', 'migrations', 'apply', opts.dbName, opts.isLocal ? '--local' : '--remote'];
    const npmPath = resolveNpmPath();

    opts.cmd.debug(`Executing: npm exec --yes -- wrangler ${args.join(' ')}`);

    const result = execFileSync(npmPath, ['exec', '--yes', '--', 'wrangler', ...args], {
      stdio: 'pipe',
      encoding: 'utf8',
      env: appConfig.getSafeEnv(),
    });

    return result;
  },
});
