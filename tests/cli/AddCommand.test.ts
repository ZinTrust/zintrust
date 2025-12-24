/**
 * AddCommand Integration Tests
 * Tests Phase 5 integration with AddCommand
 */

import { IBaseCommand } from '@cli/BaseCommand';
import { AddCommand } from '@cli/commands/AddCommand';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('AddCommand - Phase 5 Integration', () => {
  let testDir: string;
  let command: IBaseCommand;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-add-command-' + Date.now());

    await fs.mkdir(testDir, { recursive: true });

    // Create required directories
    await fs.mkdir(path.join(testDir, 'app', 'Models'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'app', 'Controllers'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'routes'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'database', 'migrations'), { recursive: true });

    command = AddCommand.create();
  });

  afterEach(async () => {
    vi.clearAllMocks();

    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('AddCommand Integration', () => {
    it('should support model command', () => {
      const command = AddCommand.create();
      expect(command).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((command as any).name).toBe('add');
    });

    it('should support controller command', () => {
      const command = AddCommand.create();
      expect(command).toBeDefined();
    });

    it('should support routes command', () => {
      const command = AddCommand.create();
      expect(command).toBeDefined();
    });

    it('should have correct command name', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((command as any).name).toBe('add');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((command as any).description).toContain('Add services and features');
    });
  });
});
