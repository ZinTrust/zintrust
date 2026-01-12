import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MigrationLoader } from '@/migrations/MigrationLoader';

type TmpFile = {
  dir: string;
  filePath: string;
};

function writeTmpMigrationFile(contents: string): TmpFile {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-migration-loader-'));
  const filePath = path.join(dir, '20260101000000_test_migration.mjs');
  fs.writeFileSync(filePath, contents, 'utf8');
  return { dir, filePath };
}

describe('MigrationLoader', () => {
  it('loads generator-style export: export const migration = { up, down }', async () => {
    const tmp = writeTmpMigrationFile(`
      export const migration = {
        async up() {},
        async down() {},
      };
    `);

    const loaded = await MigrationLoader.load(tmp.filePath);

    expect(loaded.name).toBe('20260101000000_test_migration');
    expect(typeof loaded.up).toBe('function');
    expect(typeof loaded.down).toBe('function');
  });

  it('loads default export object with up/down', async () => {
    const tmp = writeTmpMigrationFile(`
      export default {
        async up() {},
        async down() {},
      };
    `);

    const loaded = await MigrationLoader.load(tmp.filePath);

    expect(loaded.name).toBe('20260101000000_test_migration');
    expect(typeof loaded.up).toBe('function');
    expect(typeof loaded.down).toBe('function');
  });

  it('loads docs-style exports: export async function up/down', async () => {
    const tmp = writeTmpMigrationFile(`
      export async function up() {}
      export async function down() {}
    `);

    const loaded = await MigrationLoader.load(tmp.filePath);

    expect(loaded.name).toBe('20260101000000_test_migration');
    expect(typeof loaded.up).toBe('function');
    expect(typeof loaded.down).toBe('function');
  });
});
