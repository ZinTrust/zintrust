import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SeederLoader } from '@/seeders/SeederLoader';

type TmpFile = {
  dir: string;
  filePath: string;
};

function writeTmpSeederFile(name: string, contents: string): TmpFile {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-seeder-loader-'));
  const filePath = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(filePath, contents, 'utf8');
  return { dir, filePath };
}

describe('SeederLoader', () => {
  it('loads named export matching the file base name (export const UserSeeder = { run })', async () => {
    const key = '__seeder_test_named';
    (globalThis as any)[key] = 0;

    const tmp = writeTmpSeederFile(
      'UserSeeder',
      `
      export const UserSeeder = {
        async run() {
          globalThis.${key} = (globalThis.${key} || 0) + 1;
        },
      };
    `
    );

    const loaded = await SeederLoader.load(tmp.filePath);
    await loaded.run({} as any);

    expect(loaded.name).toBe('UserSeeder');
    expect((globalThis as any)[key]).toBe(1);
  });

  it('loads export const seeder = { run }', async () => {
    const key = '__seeder_test_seeder_export';
    (globalThis as any)[key] = 0;

    const tmp = writeTmpSeederFile(
      'AnySeeder',
      `
      export const seeder = {
        async run() {
          globalThis.${key} = (globalThis.${key} || 0) + 1;
        },
      };
    `
    );

    const loaded = await SeederLoader.load(tmp.filePath);
    await loaded.run({} as any);

    expect(loaded.name).toBe('AnySeeder');
    expect((globalThis as any)[key]).toBe(1);
  });

  it('loads export async function run()', async () => {
    const key = '__seeder_test_run_function';
    (globalThis as any)[key] = 0;

    const tmp = writeTmpSeederFile(
      'RunFnSeeder',
      `
      export async function run() {
        globalThis.${key} = (globalThis.${key} || 0) + 1;
      }
    `
    );

    const loaded = await SeederLoader.load(tmp.filePath);
    await loaded.run({} as any);

    expect(loaded.name).toBe('RunFnSeeder');
    expect((globalThis as any)[key]).toBe(1);
  });

  it('loads default export with run()', async () => {
    const key = '__seeder_test_default';
    (globalThis as any)[key] = 0;

    const tmp = writeTmpSeederFile(
      'DefaultSeeder',
      `
      export default {
        async run(db) {
          globalThis.${key} = (globalThis.${key} || 0) + 1;
          globalThis.__seeder_db_marker = db && db.marker;
        },
      };
    `
    );

    const loaded = await SeederLoader.load(tmp.filePath);
    await loaded.run({ marker: 'ok' } as any);

    expect(loaded.name).toBe('DefaultSeeder');
    expect((globalThis as any)[key]).toBe(1);
    expect((globalThis as any).__seeder_db_marker).toBe('ok');
  });
});
