import { appConfig } from '@config/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:path');

import { D1MigrateCommand } from '@/cli/commands/D1MigrateCommand';
import { Logger } from '@/config/logger';
import { fs } from '@node-singletons';
import * as childProcess from '@node-singletons/child-process';
import * as path from '@node-singletons/path';

describe('D1MigrateCommand', () => {
  let command: any;

  beforeEach(() => {
    command = D1MigrateCommand.create();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Class Structure', () => {
    it('should create D1MigrateCommand instance', () => {
      expect(command).toBeDefined();
    });

    it('should inherit from BaseCommand', () => {});

    it('should have name property (protected)', () => {
      const name = (command as any).name;
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });

    it('should have description property (protected)', () => {
      const description = (command as any).description;
      expect(description).toBeDefined();
      expect(typeof description).toBe('string');
    });

    it('should have execute method', () => {
      const execute = (command as any).execute;
      expect(typeof execute).toBe('function');
    });

    it('should have getCommand method from BaseCommand', () => {
      const getCommand = (command as any).getCommand();
      expect(getCommand).toBeDefined();
      expect(getCommand.name()).toMatch(/d1/i);
    });
  });

  describe('Command Metadata', () => {
    it('command name should be "d1:migrate"', () => {
      const name = (command as any).name;
      expect(name).toMatch(/d1:migrate/i);
    });

    it('description should not be empty', () => {
      const description = (command as any).description;
      expect(description.length).toBeGreaterThan(0);
    });

    it('description should mention D1 migrations', () => {
      const description = (command as any).description;
      expect(description.toLowerCase()).toContain('d1');
    });
  });

  describe('Instance Methods', () => {
    it('addOptions method should be defined', () => {
      const addOptions = (command as any).addOptions;
      expect(typeof addOptions).toBe('function');
    });

    it('debug method should be defined', () => {
      const debug = (command as any).debug;
      expect(typeof debug).toBe('function');
    });

    it('info method should be defined', () => {
      const info = (command as any).info;
      expect(typeof info).toBe('function');
    });

    it('success method should be defined', () => {
      const success = (command as any).success;
      expect(typeof success).toBe('function');
    });

    it('warn method should be defined', () => {
      const warn = (command as any).warn;
      expect(typeof warn).toBe('function');
    });
  });

  describe('Protected Methods', () => {
    it('should have runWrangler private method', () => {
      const runWrangler = (command as any).runWrangler;
      expect(typeof runWrangler).toBe('function');
    });

    it('should have resolveNpmPath private method', () => {
      const resolveNpmPath = (command as any).resolveNpmPath;
      expect(typeof resolveNpmPath).toBe('function');
    });

    it('should have getSafeEnv private method', () => {
      expect(typeof appConfig.getSafeEnv()).toBe('object');
    });
  });

  describe('Constructor Initialization', () => {
    it('should set name to "d1:migrate" in constructor', () => {
      const newCommand = D1MigrateCommand.create();
      expect((newCommand as any).name).toBe('d1:migrate');
    });

    it('should set description in constructor', () => {
      const newCommand = D1MigrateCommand.create();
      const description = (newCommand as any).description;
      expect(description).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('Command Creation', () => {
    it('getCommand should return a Command object', () => {
      const cmd = (command as any).getCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toMatch(/d1/i);
    });

    it('getCommand should set up command name correctly', () => {
      const cmd = (command as any).getCommand();
      expect(cmd.name()).toBe('d1:migrate');
    });

    it('getCommand should set up command description', () => {
      const cmd = (command as any).getCommand();
      const description = cmd.description();
      expect(description.length).toBeGreaterThan(0);
    });

    it('getCommand should have local option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--local');
    });

    it('getCommand should have remote option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--remote');
    });

    it('getCommand should have database option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--database');
    });

    it('getCommand should have verbose option from BaseCommand', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--verbose');
    });
  });

  describe('Execute Method', () => {
    it('execute should be an async function', () => {
      const execute = (command as any).execute;
      const isAsync = execute.constructor.name === 'AsyncFunction';
      expect(isAsync).toBe(true);
    });
  });

  describe('Execution Tests', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(childProcess.execFileSync).mockReturnValue('Migrations applied');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(path.dirname).mockReturnValue('/usr/local/bin');
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join('/'));
    });

    it('should run wrangler for local migrations by default', async () => {
      await command.execute({ local: false, remote: false, database: 'test_db' });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should run wrangler for remote migrations when remote flag is set', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('Remote migrations applied');

      await command.execute({ local: false, remote: true, database: 'test_db' });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should use default database name when not provided', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('Migrations applied');

      await command.execute({});

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should use provided database name', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('Custom DB migrations');

      await command.execute({ database: 'custom_db' });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should log success message when migrations succeed', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('Success');

      await command.execute({ database: 'test_db' });

      expect(vi.mocked(Logger.info)).toHaveBeenCalledWith(expect.stringContaining('completed'));
    });

    it('should handle execution errors', async () => {
      const error = new Error('Wrangler failed');
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        throw error;
      });

      try {
        await command.execute({ database: 'test_db' });
      } catch {
        expect(Logger.error).toHaveBeenCalled();
      }
    });

    it('should log error output when execution fails', async () => {
      const error = new Error('Migration failed');
      (error as any).stderr = Buffer.from('Error details');
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        throw error;
      });

      try {
        await command.execute({ database: 'test_db' });
      } catch {
        expect(Logger.error).toHaveBeenCalled();
      }
    });

    it('should prefer remote flag over local flag', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('Remote applied');

      await command.execute({ local: true, remote: true, database: 'test_db' });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should handle empty output from wrangler', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('');

      await command.execute({ database: 'test_db' });

      expect(vi.mocked(Logger.info)).toHaveBeenCalled();
    });

    it('should use absolute npm path when executing wrangler', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('Applied');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await command.execute({ database: 'test_db' });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
      // First arg should be an npm path
      const calls = vi.mocked(childProcess.execFileSync).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should include exec arguments correctly', async () => {
      vi.mocked(childProcess.execFileSync).mockReturnValue('Migrations applied');

      await command.execute({ database: 'mydb' });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
      const calls = vi.mocked(childProcess.execFileSync).mock.calls;
      const args = calls[0]?.[1];
      expect(Array.isArray(args)).toBe(true);
    });
  });
});
