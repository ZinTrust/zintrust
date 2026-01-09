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
    throw new Error(
      `zin ${args.join(' ')} failed (code=${res.status})\nstdout:\n${out}\nstderr:\n${err}`
    );
  }
}

function ensureLocalCorePackageShim(projectRoot: string, repoRoot: string): void {
  const pkgDir = path.join(projectRoot, 'node_modules', '@zintrust', 'core');
  mkdirSync(pkgDir, { recursive: true });

  const repoRootReal = realpathSync(repoRoot);
  const entryAbs = path.join(repoRootReal, 'src', 'index.ts');
  const entryUrl = pathToFileURL(entryAbs).href;

  // The CLI runs under tsx in tests, so importing a TS module via file: URL is OK.
  // We avoid setting package.json "main" directly to a TS path because Node may
  // resolve it oddly under macOS (/private prefixes) and treat it as missing.
  const bridge = `export * from ${JSON.stringify(entryUrl)};\n`;
  writeFileSync(path.join(pkgDir, 'index.mjs'), bridge);

  const shimPkg = { name: '@zintrust/core', private: true, type: 'module', main: './index.mjs' };
  writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(shimPkg, null, 2));
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

    const dbFile = path.join(root, 'test.sqlite');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'testing',
      CI: 'true',
      DB_CONNECTION: 'sqlite',
      DB_DATABASE: dbFile,
      // Ensure tsx uses this repo's tsconfig for path aliases (@cli/*, @config/*, etc),
      // even when running the CLI from a different current working directory.
      TSX_TSCONFIG_PATH: path.join(repoRoot, 'tsconfig.json'),
      // Some CLI imports expect this to exist.
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'test-jwt-secret',
    };

    try {
      runZin(['cm', 'user', '--no-interactive'], root, env);

      const created = readdirSync(migrationsDir).filter((f) =>
        /^\d{14}_create_users_table\.ts$/.test(f)
      );
      expect(created.length).toBe(1);

      runZin(['migrate', '--no-interactive'], root, env);

      // Verify schema via native sqlite.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DB = require('better-sqlite3');
      const conn = new DB(dbFile);
      try {
        const users = conn
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
          .get() as { name?: unknown } | undefined;
        expect(users?.name).toBe('users');

        const cols = conn.prepare("PRAGMA table_info('users')").all() as Array<{ name?: unknown }>;
        const names = cols
          .map((c) => (typeof c.name === 'string' ? c.name : ''))
          .filter((n) => n.length > 0);
        expect(names).toContain('id');
        expect(names).toContain('created_at');
        expect(names).toContain('updated_at');
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
