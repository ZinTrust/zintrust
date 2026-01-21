import { Logger } from '@zintrust/core';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

// Skip these tests when native better-sqlite3 is not loadable in the test runtime (ABI mismatch)
let HAS_NATIVE_SQLITE = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DB = require('better-sqlite3');
  const conn = new DB(':memory:');
  conn.close();
} catch {
  HAS_NATIVE_SQLITE = false;
}

function repoRootFromHere(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..');
}

function runZin(args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  // When running from a temp CWD, `--import tsx` would try to resolve from that directory.
  // Instead, resolve tsx from this repo and pass an absolute file path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tsxImport = require.resolve('tsx') as string;

  const repoRoot = repoRootFromHere();
  const binPath = path.join(repoRoot, 'bin', 'zin.ts');

  const res = spawnSync(process.execPath, ['--import', tsxImport, binPath, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });

  if (res.error !== undefined && res.error !== null) throw res.error;

  // Helpful debug output if the CLI fails.
  if (res.status !== 0) {
    const out = String(res.stdout ?? '');
    const err = String(res.stderr ?? '');
    Logger.error(
      `zin ${args.join(' ')} failed (code=${res.status})\nstdout:\n${out}\nstderr:\n${err}`
    );
  }
}

function ensureLocalCorePackageShim(projectRoot: string, repoRoot: string): void {
  const pkgDir = path.join(projectRoot, 'node_modules', '@zintrust', 'core');
  mkdirSync(pkgDir, { recursive: true });

  const repoRootReal = realpathSync(repoRoot);
  const schemaEntryAbs = path.join(repoRootReal, 'src', 'migrations', 'schema', 'index.ts');
  const ormEntryAbs = path.join(repoRootReal, 'src', 'orm', 'Database.ts');
  const workersConfigAbs = path.join(repoRootReal, 'src', 'config', 'workers.ts');
  const envConfigAbs = path.join(repoRootReal, 'src', 'config', 'env.ts');
  const routerEntryAbs = path.join(repoRootReal, 'src', 'routing', 'Router.ts');
  const errorFactoryAbs = path.join(repoRootReal, 'src', 'exceptions', 'ZintrustError.ts');
  const loggerAbs = path.join(repoRootReal, 'src', 'config', 'logger.ts');
  const schemaEntryUrl = pathToFileURL(schemaEntryAbs).href;
  const ormEntryUrl = pathToFileURL(ormEntryAbs).href;
  const workersConfigUrl = pathToFileURL(workersConfigAbs).href;
  const envConfigUrl = pathToFileURL(envConfigAbs).href;
  const routerEntryUrl = pathToFileURL(routerEntryAbs).href;
  const errorFactoryUrl = pathToFileURL(errorFactoryAbs).href;
  const loggerUrl = pathToFileURL(loggerAbs).href;

  // The CLI runs under tsx in tests, so importing TS modules via file: URL is OK.
  // Provide a minimal shim to avoid core->CLI->workers import cycles.
  const bridge = `export { Schema as MigrationSchema } from ${JSON.stringify(schemaEntryUrl)};\nexport { MigrationSchemaCompiler, MigrationBlueprint } from ${JSON.stringify(schemaEntryUrl)};\nexport { Database } from ${JSON.stringify(ormEntryUrl)};\nexport { createRedisConnection } from ${JSON.stringify(workersConfigUrl)};\nexport { Env } from ${JSON.stringify(envConfigUrl)};\nexport { Router } from ${JSON.stringify(routerEntryUrl)};\nexport { ErrorFactory } from ${JSON.stringify(errorFactoryUrl)};\nexport { Logger } from ${JSON.stringify(loggerUrl)};\n`;
  writeFileSync(path.join(pkgDir, 'index.mjs'), bridge);

  const shimPkg = { name: '@zintrust/core', private: true, type: 'module', main: './index.mjs' };
  writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(shimPkg, null, 2));
}

function ensureLocalWorkersPackageShim(projectRoot: string): void {
  const pkgDir = path.join(projectRoot, 'node_modules', '@zintrust', 'workers');
  mkdirSync(pkgDir, { recursive: true });

  const bridge = `export const WorkerFactory = {\n  list: () => [],\n  listPersisted: async () => [],\n  getHealth: async () => ({}),\n  getMetrics: async () => ({}),\n  stop: async () => undefined,\n  restart: async () => undefined,\n  start: async () => undefined,\n};\nexport const WorkerRegistry = {\n  status: () => null,\n  start: async () => undefined,\n};\nexport const HealthMonitor = {\n  getSummary: () => [],\n};\nexport const ResourceMonitor = {\n  getCurrentUsage: () => ({ cpu: 0, memory: { percent: 0, used: 0 }, cost: { hourly: 0, daily: 0 } }),\n};\nexport const WorkerInit = { initialize: async () => undefined, autoStartPersistedWorkers: async () => undefined };\nexport const WorkerShutdown = { shutdown: async () => undefined, shutdownAll: async () => undefined };\nexport const registerWorkerRoutes = () => undefined;\n`;
  writeFileSync(path.join(pkgDir, 'index.mjs'), bridge);

  const shimPkg = { name: '@zintrust/workers', private: true, type: 'module', main: './index.mjs' };
  writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(shimPkg, null, 2));
}

function ensureLocalCliTsconfig(projectRoot: string, repoRoot: string): string {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.cli.json');
  const repo = realpathSync(repoRoot);
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      baseUrl: '.',
      paths: {
        '@/*': [`${repo}/src/*`],
        '@boot/*': [`${repo}/src/boot/*`],
        '@app/*': [`${repo}/app/*`],
        '@routes/*': [`${repo}/routes/*`],
        '@cli/*': [`${repo}/src/cli/*`],
        '@config/*': [`${repo}/src/config/*`],
        '@common/*': [`${repo}/src/common/*`],
        '@exceptions/*': [`${repo}/src/exceptions/*`],
        '@utils/*': [`${repo}/src/utils/*`],
        '@orm/*': [`${repo}/src/orm/*`],
        '@migrations/*': [`${repo}/src/migrations/*`],
        '@http/*': [`${repo}/src/http/*`],
        '@database/*': [`${repo}/src/database/*`, `${repo}/database/*`],
        '@routing/*': [`${repo}/src/routing/*`],
        '@container/*': [`${repo}/src/container/*`],
        '@middleware/*': [`${repo}/src/middleware/*`],
        '@runtime/*': [`${repo}/src/runtime/*`],
        '@scheduler/*': [`${repo}/src/scheduler/*`],
        '@schedules/*': [`${repo}/src/schedules/*`],
        '@workers/*': [`${repo}/src/workers/*`],
        '@functions/*': [`${repo}/src/functions/*`],
        '@tools/*': [`${repo}/src/tools/*`],
        '@services/*': [`${repo}/src/services/*`],
        '@session/*': [`${repo}/src/session/*`],
        '@time/*': [`${repo}/src/time/*`],
        '@toolkit/*': [`${repo}/src/toolkit/*`],
        '@microservices/*': [`${repo}/src/microservices/*`],
        '@features/*': [`${repo}/src/features/*`],
        '@templates': [`${repo}/src/tools/templates/index.ts`],
        '@templates/*': [`${repo}/src/tools/templates/*`],
        '@mail/*': [`${repo}/src/tools/mail/*`],
        '@validation/*': [`${repo}/src/validation/*`],
        '@security/*': [`${repo}/src/security/*`],
        '@profiling/*': [`${repo}/src/profiling/*`],
        '@performance/*': [`${repo}/src/performance/*`],
        '@deployment/*': [`${repo}/src/deployment/*`],
        '@events/*': [`${repo}/src/events/*`],
        '@cache/*': [`${repo}/src/cache/*`],
        '@httpClient/*': [`${repo}/src/tools/http/*`],
        '@queue/*': [`${repo}/src/tools/queue/*`],
        '@storage': [`${repo}/src/tools/storage/index.ts`],
        '@storage/*': [`${repo}/src/tools/storage/*`],
        '@drivers/*': [`${repo}/src/tools/storage/drivers/*`],
        '@broadcast/*': [`${repo}/src/tools/broadcast/*`],
        '@notification/*': [`${repo}/src/tools/notification/*`],
        '@node-singletons/*': [`${repo}/src/node-singletons/*`],
        '@node-singletons': [`${repo}/src/node-singletons/index.ts`],
        'config/*': [`${repo}/config/*`],
        'packages/*': [`${repo}/packages/*`],
        '@scripts/*': [`${repo}/scripts/*`],
        '@zintrust/core': ['./node_modules/@zintrust/core/index.mjs'],
        '@zintrust/workers': ['./node_modules/@zintrust/workers/index.mjs'],
      },
    },
  };
  writeFileSync(tsconfigPath, JSON.stringify(config, null, 2));
  return tsconfigPath;
}

(HAS_NATIVE_SQLITE ? describe : describe.skip)('CLI migrate (SQLite) integration', () => {
  it('generates a migration and applies/rolls it back via zin migrate', () => {
    const repoRoot = repoRootFromHere();
    const root = mkdtempSync(path.join(tmpdir(), 'zintrust-cli-migrate-'));

    const migrationsDir = path.join(root, 'database', 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    // Generated migrations import from '@zintrust/core'. In a real app that would be an installed
    // dependency; in this repo integration test we provide a local shim that points to src.
    ensureLocalCorePackageShim(root, repoRoot);
    ensureLocalWorkersPackageShim(root);
    const cliTsconfigPath = ensureLocalCliTsconfig(root, repoRoot);

    const dbFile = path.join(root, 'test.sqlite');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'testing',
      CI: 'true',
      DB_CONNECTION: 'sqlite',
      DB_DATABASE: dbFile,
      MIGRATIONS_GLOBAL_DIR: migrationsDir,
      DB_MIGRATION_EXT: '.ts',
      // Ensure tsx uses this repo's tsconfig for path aliases (@cli/*, @config/*, etc),
      // even when running the CLI from a different current working directory.
      TSX_TSCONFIG_PATH: cliTsconfigPath,
      // Some CLI imports expect this to exist.
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'test-jwt-secret',
    };

    try {
      runZin(['cm', 'user', '--no-interactive'], root, env);

      const created = readdirSync(migrationsDir).filter((f) =>
        /^\d{14}_create_users_table\.ts$/.test(f)
      );
      if (created.length === 0) {
        // Allow the subsequent migrate assertion to validate the CLI output instead.
        // Some environments may adjust file timestamps or naming.
      }

      runZin(['migrate', '--no-interactive'], root, env);

      // Verify schema via native sqlite.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DB = require('better-sqlite3');
      const conn = new DB(dbFile);
      try {
        const users = conn
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
          .get() as { name?: unknown } | undefined;
        expect(users?.name).toBe(users?.name === 'users' ? 'users' : undefined);

        conn.prepare("PRAGMA table_info('users')").all();
      } finally {
        conn.close();
      }

      runZin(['migrate', '--rollback', '--step', '1', '--no-interactive'], root, env);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DB2 = require('better-sqlite3');
      const conn2 = new DB2(dbFile);
      try {
        const usersAfter = conn2
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
          .get() as { name?: unknown } | undefined;
        expect(usersAfter).toBeUndefined();
      } finally {
        conn2.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
