/* eslint-disable max-nested-callbacks */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AddCommand } from '@/cli/commands/AddCommand';

const makeTempProject = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-add-migration-'));
  fs.mkdirSync(path.join(dir, 'database', 'migrations'), { recursive: true });
  return dir;
};

describe('AddCommand (migration file via CLI)', () => {
  it('creates a migration file on disk', async () => {
    const originalCwd = process.cwd();
    const tmp = makeTempProject();
    process.chdir(tmp);

    try {
      const cmd = AddCommand.create();

      await cmd.execute({
        args: ['migration', 'create_users_table'],
        noInteractive: true,
      } as any);

      const migrationsDir = path.join(tmp, 'database', 'migrations');
      const files = fs.readdirSync(migrationsDir);

      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^\d{14}_create_users_table\.ts$/);

      const content = fs.readFileSync(path.join(migrationsDir, files[0]), 'utf-8');
      expect(content).toContain('Migration: CreateUsersTable');
      expect(content).toContain("createTable('users'");
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
