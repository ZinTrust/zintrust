import type { CommandOptions } from '@cli/BaseCommand';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
};

vi.mock('chalk', () => {
  const colors = {
    gray: (t: string): string => t,
    blue: (t: string): string => t,
    yellow: (t: string): string => t,
    red: (t: string): string => t,
    green: (t: string): string => t,
    cyan: (t: string): string => t,
    white: (t: string): string => t,
  };
  return {
    ...colors,
    default: colors,
  };
});

vi.mock('@config/logger', () => {
  const Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    scope: vi.fn(),
  };
  return { Logger };
});

vi.mock('@cli/logger/Logger', () => {
  const instance = {
    getLogs: vi.fn((_category: string, _lines: number): LogEntry[] => []),
    filterByLevel: vi.fn((logs: LogEntry[]) => logs),
    clearLogs: vi.fn((_category: string): boolean => true),
    getLogsDirectory: vi.fn((): string => '/logs'),
    parseLogEntry: vi.fn(
      (_line: string): LogEntry => ({
        timestamp: '2025-01-01T00:00:00.000Z',
        level: 'info',
        message: 'ok',
        data: {},
      })
    ),
  };

  return {
    Logger: {
      getInstance: vi.fn(() => instance),
    },
    __getInstance: (): typeof instance => instance,
  };
});

vi.mock('@node-singletons/fs', () => {
  const api = {
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 0 })),
    createReadStream: vi.fn(() => new EventEmitter()),
  };
  return {
    ...api,
    default: api,
    __api: api,
  };
});

describe('LogsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('display path: prints "No logs found" when empty', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');

    await LogsCommand.create().execute({} satisfies CommandOptions);
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('No logs found'));
  });

  it('display path: filters by level and prints "No logs found with level" when filtered empty', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };

    const instance = logMod.__getInstance();
    instance.getLogs.mockReturnValueOnce([
      { timestamp: 't', level: 'info', message: 'm', data: {} },
    ]);
    instance.filterByLevel.mockReturnValueOnce([]);

    await LogsCommand.create().execute({
      level: 'error',
      lines: '50',
      category: 'app',
    } satisfies CommandOptions);
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('No logs found with level'));
  });

  it('should handle debug and error levels in getLevelColor', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    instance.getLogs.mockReturnValue([
      { timestamp: '2025-01-01', level: 'debug', message: 'debug msg' },
      { timestamp: '2025-01-01', level: 'error', message: 'error msg' },
      { timestamp: '2025-01-01', level: 'unknown', message: 'unknown msg' },
    ]);
    instance.filterByLevel.mockImplementation((logs: any) => logs);

    await LogsCommand.create().execute({ level: 'all' });

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[UNKNOWN]'));
  });

  it('should print log entry with data', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    instance.getLogs.mockReturnValue([
      { timestamp: '2025-01-01', level: 'info', message: 'msg', data: { key: 'val' } },
    ]);

    await LogsCommand.create().execute({});

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('"key":"val"'));
  });

  it('should handle processLogChunk error', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    instance.parseLogEntry.mockImplementation(() => {
      throw new Error('Parse error');
    });

    vi.useFakeTimers();
    const fsMod = (await import('@node-singletons/fs')) as any;
    const mockStream = new EventEmitter();
    fsMod.__api.existsSync.mockReturnValue(true);
    fsMod.__api.statSync.mockReturnValue({ size: 10 });
    fsMod.__api.createReadStream.mockReturnValue(mockStream);

    await LogsCommand.create().execute({ follow: true });
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    mockStream.emit('data', 'some log line');
    await Promise.resolve();

    // The processing should swallow parse errors and not print parsed entries.
    expect(Logger.info).not.toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
  });

  it('should cover all branches in followLogs interval', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    vi.useFakeTimers();
    const fsMod = (await import('@node-singletons/fs')) as any;

    fsMod.__api.existsSync
      .mockReturnValueOnce(true) // categoryDir check
      .mockReturnValueOnce(true) // interval 1: exists
      .mockReturnValueOnce(true) // interval 2: exists
      .mockReturnValue(false); // interval 3: missing

    fsMod.__api.statSync
      .mockReturnValueOnce({ size: 10 }) // interval 1
      .mockReturnValueOnce({ size: 10 }); // interval 2

    const mockStream = new EventEmitter();
    fsMod.__api.createReadStream.mockReturnValue(mockStream);

    await LogsCommand.create().execute({ follow: true });

    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    mockStream.emit('data', 'line1');
    await Promise.resolve();

    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(fsMod.__api.createReadStream).toHaveBeenCalled();
  });

  it('should throw error if LoggerInstance does not support parseLogEntry', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    const originalParse = instance.parseLogEntry;
    delete instance.parseLogEntry;

    vi.useFakeTimers();
    const fsMod = (await import('@node-singletons/fs')) as any;
    const mockStream = new EventEmitter();
    fsMod.__api.existsSync.mockReturnValue(true);
    fsMod.__api.statSync.mockReturnValue({ size: 10 });
    fsMod.__api.createReadStream.mockReturnValue(mockStream);

    await LogsCommand.create().execute({ follow: true });
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    mockStream.emit('data', 'some log line');
    await Promise.resolve();

    const { Logger } = await import('@config/logger');
    expect(Logger.error).toHaveBeenCalled();

    instance.parseLogEntry = originalParse;
  });

  it('should handle followLogs with missing directory', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const fsMod = (await import('@node-singletons/fs')) as any;
    fsMod.__api.existsSync.mockReturnValue(false);

    await LogsCommand.create().execute({ follow: true });
    const { Logger } = await import('@config/logger');
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Log category directory not found')
    );
  });

  it('should handle clearLogs success', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    instance.clearLogs.mockReturnValue(true);

    await LogsCommand.create().execute({ clear: true });
    const { Logger } = await import('@config/logger');
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleared logs for category'));
  });

  it('should handle clearLogs failure', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    instance.clearLogs.mockReturnValue(false);

    await LogsCommand.create().execute({ clear: true });
    const { Logger } = await import('@config/logger');
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Failed to clear logs'));
  });

  it('should handle SIGINT in followLogs', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const fsMod = (await import('@node-singletons/fs')) as any;
    fsMod.__api.existsSync.mockReturnValue(true);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await LogsCommand.create().execute({ follow: true });
    process.emit('SIGINT');

    expect(mockExit).toHaveBeenCalledWith(0);
    mockExit.mockRestore();
  });

  it('should handle fatal level in getLevelColor', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    instance.getLogs.mockReturnValue([
      { timestamp: '2025-01-01', level: 'fatal', message: 'fatal msg' },
    ]);
    instance.filterByLevel.mockImplementation((logs: any) => logs);

    await LogsCommand.create().execute({ level: 'fatal' });
    const { Logger } = await import('@config/logger');
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[FATAL]'));
  });

  it('should handle warn level in getLevelColor', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => any;
    };
    const instance = logMod.__getInstance();
    instance.getLogs.mockReturnValue([
      { timestamp: '2025-01-01', level: 'warn', message: 'warn msg' },
    ]);
    instance.filterByLevel.mockImplementation((logs: any) => logs);

    await LogsCommand.create().execute({ level: 'warn' });
    const { Logger } = await import('@config/logger');
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
  });

  it('should test register method action', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    let actionCallback: any;
    const mockCmd = {
      description: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      action: vi.fn().mockImplementation((cb) => {
        actionCallback = cb;
        return mockCmd;
      }),
    };
    const mockProgram = {
      command: vi.fn().mockReturnValue(mockCmd),
    } as any;

    LogsCommand.register(mockProgram);
    expect(mockProgram.command).toHaveBeenCalledWith('logs');

    if (actionCallback) {
      actionCallback({ level: 'info' });
    }
  });

  it('should cover category option in addOptions', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const mockCommand = {
      option: vi.fn().mockReturnThis(),
    } as any;
    LogsCommand.create().addOptions!(mockCommand);
    expect(mockCommand.option).toHaveBeenCalledWith(
      '--category <category>',
      expect.any(String),
      'app'
    );
  });
});
