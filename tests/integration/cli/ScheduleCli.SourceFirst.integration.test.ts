import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type CliResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function repoRootFromHere(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..');
}

function ensureLocalCliTsconfig(projectRoot: string, repoRoot: string): string {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.cli.json');
  const repo = path.resolve(repoRoot);
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      baseUrl: '.',
      paths: {
        '@/*': [`${repo}/src/*`],
        '@app/*': [`${projectRoot}/app/*`],
        '@routes/*': [`${projectRoot}/routes/*`, `${repo}/routes/*`],
        '@registry/*': [`${repo}/src/boot/registry/*`],
        '@boot/*': [`${repo}/src/boot/*`],
        '@bootstrap/*': [`${repo}/src/bootstrap/*`],
        '@cli/*': [`${repo}/src/cli/*`],
        '@config/*': [`${repo}/src/config/*`],
        '@runtime-config/*': [`${repo}/config/*`],
        '@common/*': [`${repo}/src/common/*`],
        '@helper/*': [`${repo}/src/helper/*`],
        '@exceptions/*': [`${repo}/src/exceptions/*`],
        '@orm/*': [`${repo}/src/orm/*`],
        '@migrations/*': [`${repo}/src/migrations/*`],
        '@types/*': [`${repo}/src/types/*`],
        '@utils/*': [`${repo}/src/utils/*`],
        '@http/*': [`${repo}/src/http/*`],
        '@container/*': [`${repo}/src/container/*`],
        '@proxy/*': [`${repo}/src/proxy/*`],
        '@routing/*': [`${repo}/src/routing/*`],
        '@middleware/*': [`${repo}/src/middleware/*`],
        '@runtime/*': [`${repo}/src/runtime/*`],
        '@database/*': [`${repo}/src/database/*`, `${repo}/database/*`],
        '@scheduler/*': [`${repo}/src/scheduler/*`],
        '@schedules/*': [`${repo}/src/schedules/*`],
        '@workers/*': [`${repo}/src/workers/*`],
        '@sockets/*': [`${repo}/src/sockets/*`],
        '@collections/*': [`${repo}/src/collections/*`],
        '@tools/*': [`${repo}/src/tools/*`],
        '@services/*': [`${repo}/src/services/*`],
        '@session/*': [`${repo}/src/session/*`],
        '@toolkit/*': [`${repo}/src/toolkit/*`],
        '@microservices/*': [`${repo}/src/microservices/*`],
        '@cache/*': [`${repo}/src/cache/*`],
        '@validation/*': [`${repo}/src/validation/*`],
        '@security/*': [`${repo}/src/security/*`],
        '@events/*': [`${repo}/src/events/*`],
        '@functions/*': [`${repo}/src/functions/*`],
        '@time/*': [`${repo}/src/time/*`],
        '@core-routes/*': [`${repo}/src/routes/*`],
        '@auth/*': [`${repo}/src/auth/*`],
        '@lang/*': [`${repo}/src/lang/*`],
        '@templates': [`${repo}/src/tools/templates/index.ts`],
        '@templates/*': [`${repo}/src/tools/templates/*`],
        '@queue/*': [`${repo}/src/tools/queue/*`],
        '@scripts/*': [`${repo}/scripts/*`],
        '@storage': [`${repo}/src/tools/storage/index.ts`],
        '@storage/*': [`${repo}/src/tools/storage/*`],
        '@broadcast/*': [`${repo}/src/tools/broadcast/*`],
        '@notification/*': [`${repo}/src/tools/notification/*`],
        '@node-singletons/*': [`${repo}/src/node-singletons/*`],
        '@node-singletons': [`${repo}/src/node-singletons/index.ts`],
        '@mail/*': [`${repo}/src/tools/mail/*`],
        '@httpClient/*': [`${repo}/src/tools/http/*`],
        '@drivers/*': [`${repo}/src/tools/storage/drivers/*`],
        '@profiling/*': [`${repo}/src/profiling/*`],
        '@performance/*': [`${repo}/src/performance/*`],
        '@deployment/*': [`${repo}/src/deployment/*`],
        '@processors/*': [`${projectRoot}/processors/*`, `${repo}/processors/*`],
        'config/*': [`${repo}/config/*`],
      },
    },
  };

  writeFileSync(tsconfigPath, JSON.stringify(config, null, 2));
  return tsconfigPath;
}

function createScheduleProjectFixture(projectRoot: string): { outputFile: string } {
  mkdirSync(path.join(projectRoot, 'app', 'Schedules'), { recursive: true });
  mkdirSync(path.join(projectRoot, 'app', 'Toolkit'), { recursive: true });
  mkdirSync(path.join(projectRoot, 'routes'), { recursive: true });

  const outputFile = path.join(projectRoot, 'tmp', 'schedule-output.log');

  writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'schedule-cli-fixture',
        private: true,
        type: 'module',
      },
      null,
      2
    ) + '\n'
  );

  writeFileSync(path.join(projectRoot, 'routes', 'api.ts'), 'export {}\n');

  writeFileSync(
    path.join(projectRoot, 'app', 'Toolkit', 'scheduleMarker.ts'),
    `import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export const appendMarker = (name: string): void => {
  const outputFile = path.join(process.cwd(), 'tmp', 'schedule-output.log');
  mkdirSync(path.dirname(outputFile), { recursive: true });
  appendFileSync(outputFile, \`${'${name}'}\\n\`);
};
`
  );

  writeFileSync(
    path.join(projectRoot, 'app', 'Schedules', 'index.ts'),
    `import { appendMarker } from '@app/Toolkit/scheduleMarker';

const defaultSchedule = {
  name: 'fixture.default',
  handler: async (): Promise<void> => {
    appendMarker('default');
  },
};

export const namedSchedule = {
  name: 'fixture.named',
  handler: async (): Promise<void> => {
    appendMarker('named');
  },
};

export default defaultSchedule;
`
  );

  return { outputFile };
}

function runZin(args: string[], cwd: string, env: NodeJS.ProcessEnv): CliResult {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tsxImport = require.resolve('tsx');

  const repoRoot = repoRootFromHere();
  const binPath = path.join(repoRoot, 'bin', 'zin.ts');
  const res = spawnSync(process.execPath, ['--import', tsxImport, binPath, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });

  if (res.error !== undefined && res.error !== null) throw res.error;

  return {
    status: res.status,
    stdout: String(res.stdout ?? ''),
    stderr: String(res.stderr ?? ''),
  };
}

function assertSuccessfulCliRun(result: CliResult, args: string[]): void {
  if (result.status === 0) return;

  throw new Error(
    `zin ${args.join(' ')} failed (code=${String(result.status)})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

describe('schedule CLI source-first integration', () => {
  it('discovers mixed default and named project schedules and runs named schedules once', () => {
    const repoRoot = repoRootFromHere();
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'zintrust-schedule-cli-'));

    try {
      const { outputFile } = createScheduleProjectFixture(projectRoot);
      const cliTsconfigPath = ensureLocalCliTsconfig(projectRoot, repoRoot);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'testing',
        CI: 'true',
        JWT_SECRET: process.env['JWT_SECRET'] ?? 'test-jwt-secret',
        TSX_TSCONFIG_PATH: cliTsconfigPath,
        ZINTRUST_PROJECT_ROOT: projectRoot,
      };

      const listResult = runZin(['schedule:list', '--json'], projectRoot, env);
      assertSuccessfulCliRun(listResult, ['schedule:list', '--json']);
      expect(listResult.stdout).toContain('fixture.default');
      expect(listResult.stdout).toContain('fixture.named');

      const runResult = runZin(['schedule:run', '--name', 'fixture.named'], projectRoot, env);
      assertSuccessfulCliRun(runResult, ['schedule:run', '--name', 'fixture.named']);
      expect(readFileSync(outputFile, 'utf8')).toBe('named\n');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }, 60000);
});
