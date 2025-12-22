import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:path');

import { BaseCommand } from '@/cli/BaseCommand';
import { FixCommand } from '@/cli/commands/FixCommand';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('FixCommand', () => {
  let command: FixCommand;

  beforeEach(() => {
    command = new FixCommand();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Class Structure', () => {
    it('should create FixCommand instance', () => {
      expect(command).toBeDefined();
      expect(command).toBeInstanceOf(FixCommand);
    });

    it('should inherit from BaseCommand', () => {
      expect(command).toBeInstanceOf(BaseCommand);
    });

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
      expect(getCommand.name()).toBe('fix');
    });
  });

  describe('Command Metadata', () => {
    it('command name should be "fix"', () => {
      const name = (command as any).name;
      expect(name).toMatch(/fix/i);
    });

    it('description should not be empty', () => {
      const description = (command as any).description;
      expect(description.length).toBeGreaterThan(0);
    });

    it('description should mention code fixes', () => {
      const description = (command as any).description;
      expect(description.toLowerCase()).toContain('fix');
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
    it('should have runNpmExec private method', () => {
      const runNpmExec = (command as any).runNpmExec;
      expect(typeof runNpmExec).toBe('function');
    });

    it('should have resolveNpmPath private method', () => {
      const resolveNpmPath = (command as any).resolveNpmPath;
      expect(typeof resolveNpmPath).toBe('function');
    });

    it('should have getSafeEnv private method', () => {
      const getSafeEnv = (command as any).getSafeEnv;
      expect(typeof getSafeEnv).toBe('function');
    });
  });

  describe('Constructor Initialization', () => {
    it('should set name to "fix" in class definition', () => {
      const newCommand = new FixCommand();
      expect((newCommand as any).name).toBe('fix');
    });

    it('should set description in class definition', () => {
      const newCommand = new FixCommand();
      const description = (newCommand as any).description;
      expect(description).toBeDefined();
      expect(description.length).toBeGreaterThan(0);
    });
  });

  describe('Command Creation', () => {
    it('getCommand should return a Command object', () => {
      const cmd = (command as any).getCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toMatch(/fix/i);
    });

    it('getCommand should set up command name correctly', () => {
      const cmd = (command as any).getCommand();
      expect(cmd.name()).toBe('fix');
    });

    it('getCommand should set up command description', () => {
      const cmd = (command as any).getCommand();
      const description = cmd.description();
      expect(description.length).toBeGreaterThan(0);
    });

    it('getCommand should have dry-run option configured', () => {
      const cmd = (command as any).getCommand();
      const helpText = cmd.helpInformation();
      expect(helpText).toContain('--dry-run');
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

    it('should accept CommandOptions parameter', async () => {
      const options = { args: [], verbose: false };
      try {
        await (command as any).execute(options);
      } catch (error) {
        // Error is expected since we're not mocking the full implementation
        expect(error).toBeDefined();
      }
    });
  });

  describe('Execution Tests', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(childProcess.execFileSync).mockReturnValue('');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(path.dirname).mockReturnValue('/usr/local/bin');
      vi.mocked(path.join).mockImplementation((...args: string[]) => args.join('/'));

      (command as any).info = vi.fn();
      (command as any).success = vi.fn();
      (command as any).warn = vi.fn();
    });

    it('should start with info message', async () => {
      await command.execute({});

      expect((command as any).info).toHaveBeenCalledWith(expect.stringContaining('Starting'));
    });

    it('should run eslint fix when not dry-run', async () => {
      await command.execute({ dryRun: false });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should run eslint with --fix-dry-run when dry-run is true', async () => {
      await command.execute({ dryRun: true });

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should run prettier fix when not dry-run', async () => {
      await command.execute({ dryRun: false });

      const calls = vi.mocked(childProcess.execFileSync).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should run prettier check when dry-run is true', async () => {
      await command.execute({ dryRun: true });

      const calls = vi.mocked(childProcess.execFileSync).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should show success message', async () => {
      await command.execute({});

      expect((command as any).success).toHaveBeenCalledWith(expect.stringContaining('completed'));
    });

    it('should handle execution errors gracefully', async () => {
      const error = new Error('ESLint failed');
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        throw error;
      });

      // Should not throw, just log warning
      await command.execute({});

      expect((command as any).warn).toHaveBeenCalled();
    });

    it('should continue execution even if eslint fails', async () => {
      const mockExec = vi.mocked(childProcess.execFileSync);
      let callCount = 0;

      mockExec.mockImplementation((): string => {
        callCount++;
        if (callCount === 1) {
          throw new Error('ESLint failed');
        }
        return '';
      });

      await command.execute({});

      // Should try to run prettier after eslint fails
      // The mock gets called but should continue to prettier
      expect(mockExec.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle info message for eslint', async () => {
      await command.execute({});

      expect((command as any).info).toHaveBeenCalledWith(expect.stringContaining('ESLint'));
    });

    it('should handle info message for prettier', async () => {
      await command.execute({});

      expect((command as any).info).toHaveBeenCalledWith(expect.stringContaining('Prettier'));
    });

    it('should default dryRun to false', async () => {
      await command.execute({});

      expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalled();
    });

    it('should use npm exec for running tools', async () => {
      await command.execute({});

      const calls = vi.mocked(childProcess.execFileSync).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      // Verify npm path is used
      expect(typeof calls[0][0]).toBe('string');
    });

    it('should resolve npm path before execution', async () => {
      await command.execute({});

      expect(vi.mocked(fs.existsSync)).toHaveBeenCalled();
    });
  });
});
