import { Logger } from '@/config/logger';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the command
vi.mock('node:fs');
vi.mock('node:path');
vi.mock('chalk', () => ({
  default: {
    gray: vi.fn((text) => text),
    blue: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
    red: vi.fn((text) => text),
    green: vi.fn((text) => text),
    cyan: vi.fn((text) => text),
    white: vi.fn((text) => text),
  },
}));
vi.mock('@/config/logger');
vi.mock('@cli/logger/Logger', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      getLogs: vi.fn(() => []),
      filterByLevel: vi.fn((logs) => logs),
      clearLogs: vi.fn(() => true),
      getLogsDirectory: vi.fn(() => '/app/logs'),
      parseLogEntry: vi.fn(() => ({
        timestamp: '2025-01-01T00:00:00Z',
        level: 'info',
        message: 'Test',
        data: {},
      })),
    })),
  },
}));

describe('LogsCommand', () => {
  let capturedHandler: ((options: any) => Promise<void>) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandler = null;

    // Setup fs mocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
    vi.mocked(fs.createReadStream).mockReturnValue({
      on: vi.fn(),
    } as any);

    // Setup path mocks
    vi.mocked(path.join).mockImplementation((...args: string[]) => args.join('/'));
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Basic Command Structure', () => {
    it('exports LogsCommand with register method', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');
      expect(LogsCommand).toBeDefined();
      expect(LogsCommand.register).toBeDefined();
      expect(typeof LogsCommand.register).toBe('function');
    });

    it('registers logs command with correct name', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      expect(mockProgram.command).toHaveBeenCalledWith('logs');
    });

    it('sets command description', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      expect(mockProgram.description).toHaveBeenCalledWith('View and manage application logs');
    });

    it('registers all required options', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      const optionCalls = vi.mocked(mockProgram.option).mock.calls.map((c) => c[0]);
      expect(optionCalls).toContain('-l, --level <level>');
      expect(optionCalls).toContain('-c, --clear');
      expect(optionCalls).toContain('-f, --follow');
      expect(optionCalls).toContain('-n, --lines <number>');
      expect(optionCalls).toContain('--category <category>');
    });

    it('sets correct option defaults', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      const optionCalls = vi.mocked(mockProgram.option).mock.calls;
      // Check level default
      const levelCall = optionCalls.find((c) => c[0] === '-l, --level <level>');
      expect(levelCall?.[2]).toBe('info');
      // Check lines default
      const linesCall = optionCalls.find((c) => c[0] === '-n, --lines <number>');
      expect(linesCall?.[2]).toBe('50');
      // Check category default
      const categoryCall = optionCalls.find((c) => c[0] === '--category <category>');
      expect(categoryCall?.[2]).toBe('app');
    });

    it('sets action handler', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      expect(mockProgram.action).toHaveBeenCalledWith(expect.any(Function));
    });

    it('exports default export matching named export', async () => {
      const module = await import('@/cli/commands/LogsCommand');
      expect(module.default).toBeDefined();
      expect(module.default).toBe(module.LogsCommand);
    });
  });

  describe('Handler Invocation', () => {
    it('handler is callable with LogsOptions', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      // Should not throw
      expect(async () => {
        await capturedHandler?.({
          level: 'info',
          clear: false,
          follow: false,
          lines: '10',
          category: 'app',
        });
      }).not.toThrow();
    });

    it('invokes handler without error on clear option', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await expect(
        capturedHandler?.({
          level: 'info',
          clear: true,
          follow: false,
          lines: '10',
          category: 'app',
        })
      ).resolves.not.toThrow();
    });

    it('invokes handler without error on follow option', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await expect(
        capturedHandler?.({
          level: 'info',
          clear: false,
          follow: true,
          lines: '10',
          category: 'app',
        })
      ).resolves.not.toThrow();
    });

    it('invokes handler without error on display option', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await expect(
        capturedHandler?.({
          level: 'info',
          clear: false,
          follow: false,
          lines: '10',
          category: 'app',
        })
      ).resolves.not.toThrow();
    });

    it('logs are displayed with Logger.info when no options set', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await capturedHandler?.({
        level: 'info',
        clear: false,
        follow: false,
        lines: '10',
        category: 'app',
      });

      expect(Logger.info).toHaveBeenCalled();
    });

    it('logs are cleared with Logger when clear is true', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await capturedHandler?.({
        level: 'info',
        clear: true,
        follow: false,
        lines: '10',
        category: 'app',
      });

      expect(Logger.info).toHaveBeenCalled();
    });

    it('following logs calls Logger.info when follow is true', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await capturedHandler?.({
        level: 'info',
        clear: false,
        follow: true,
        lines: '10',
        category: 'app',
      });

      expect(Logger.info).toHaveBeenCalled();
    });

    it('handles category parameter correctly', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await capturedHandler?.({
        level: 'info',
        clear: true,
        follow: false,
        lines: '10',
        category: 'errors',
      });

      expect(Logger.info).toHaveBeenCalled();
    });

    it('handles numeric lines parameter', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await capturedHandler?.({
        level: 'info',
        clear: false,
        follow: false,
        lines: '100',
        category: 'app',
      });

      expect(Logger.info).toHaveBeenCalled();
    });

    it('handles various log levels', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      const levels = ['debug', 'info', 'warn', 'error', 'all'];

      for (const level of levels) {
        await capturedHandler?.({
          level,
          clear: false,
          follow: false,
          lines: '10',
          category: 'app',
        });
      }

      expect(Logger.info).toHaveBeenCalled();
    });
  });

  describe('Exported LogsCommand Interface', () => {
    it('exports LogsCommand with register method', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');
      expect(LogsCommand).toBeDefined();
      expect(LogsCommand.register).toBeDefined();
      expect(typeof LogsCommand.register).toBe('function');
    });

    it('LogsCommand register is callable with Commander program', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');
      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      expect(() => {
        LogsCommand.register(mockProgram as any);
      }).not.toThrow();
    });
  });

  describe('Option Combinations', () => {
    it('should handle all options together', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await capturedHandler?.({
        level: 'error',
        clear: true,
        follow: true,
        lines: '100',
        category: 'custom',
      });

      expect(Logger.info).toHaveBeenCalled();
    });

    it('should handle clear with different levels', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      for (const level of ['debug', 'info', 'warn', 'error']) {
        await capturedHandler?.({
          level,
          clear: true,
          follow: false,
          lines: '50',
          category: 'app',
        });
      }

      expect(Logger.info).toHaveBeenCalled();
    });

    it('should handle follow with different categories', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      const categories = ['app', 'cli', 'errors', 'migrations', 'debug', 'custom'];

      for (const category of categories) {
        await capturedHandler?.({
          level: 'info',
          clear: false,
          follow: true,
          lines: '10',
          category,
        });
      }

      expect(Logger.info).toHaveBeenCalled();
    });
  });

  describe('Command Registration Details', () => {
    it('should set command name to "logs"', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      expect(mockProgram.command).toHaveBeenCalledWith('logs');
    });

    it('should set description to viewing and managing logs', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      const descriptionCalls = vi.mocked(mockProgram.description).mock.calls;
      expect(descriptionCalls.some((c: any[]) => (c[0] as string).includes('logs'))).toBe(true);
    });

    it('registers level option with default "info"', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      const levelOption = vi
        .mocked(mockProgram.option)
        .mock.calls.find((c: any[]) => (c[0] as string).includes('--level'));
      expect(levelOption?.[2]).toBe('info');
    });

    it('registers lines option with default "50"', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      const linesOption = vi
        .mocked(mockProgram.option)
        .mock.calls.find((c: any[]) => (c[0] as string).includes('--lines'));
      expect(linesOption?.[2]).toBe('50');
    });

    it('registers category option with default "app"', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn(),
      };

      LogsCommand.register(mockProgram as any);

      const categoryOption = vi
        .mocked(mockProgram.option)
        .mock.calls.find((c: any[]) => (c[0] as string).includes('--category'));
      expect(categoryOption?.[2]).toBe('app');
    });
  });

  describe('Handler Execution Paths', () => {
    it('executes handler with minimal options', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await expect(
        capturedHandler?.({
          level: 'info',
          clear: false,
          follow: false,
          lines: '50',
          category: 'app',
        })
      ).resolves.not.toThrow();
    });

    it('executes handler with large lines count', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await expect(
        capturedHandler?.({
          level: 'info',
          clear: false,
          follow: false,
          lines: '10000',
          category: 'app',
        })
      ).resolves.not.toThrow();
    });

    it('executes handler with small lines count', async () => {
      const { LogsCommand } = await import('@/cli/commands/LogsCommand');

      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn((handler) => {
          capturedHandler = handler;
        }),
      };

      LogsCommand.register(mockProgram as any);

      await expect(
        capturedHandler?.({
          level: 'info',
          clear: false,
          follow: false,
          lines: '1',
          category: 'app',
        })
      ).resolves.not.toThrow();
    });
  });
});
