import type { CommandOptions } from '@cli/BaseCommand';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
};

vi.mock('chalk', () => ({
  default: {
    gray: (t: string): string => t,
    blue: (t: string): string => t,
    yellow: (t: string): string => t,
    red: (t: string): string => t,
    green: (t: string): string => t,
    cyan: (t: string): string => t,
    white: (t: string): string => t,
  },
}));

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

vi.mock('node:fs', () => {
  const api = {
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 0 })),
    createReadStream: vi.fn(() => ({ on: vi.fn() })),
  };
  return {
    default: api,
    ...api,
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
      __getInstance: () => unknown;
    };

    const instance = logMod.__getInstance() as {
      getLogs: ReturnType<typeof vi.fn>;
      filterByLevel: ReturnType<typeof vi.fn>;
    };

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

  it('clear path: prints success and failure based on clearLogs return', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => unknown;
    };

    const instance = logMod.__getInstance() as { clearLogs: ReturnType<typeof vi.fn> };

    instance.clearLogs.mockReturnValueOnce(true);
    await LogsCommand.create().execute({ clear: true, category: 'app' } satisfies CommandOptions);
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleared logs'));

    instance.clearLogs.mockReturnValueOnce(false);
    await LogsCommand.create().execute({ clear: true, category: 'app' } satisfies CommandOptions);
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Failed to clear logs'));
  });

  it('follow path: early returns when category directory is missing', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');
    const fsMod = (await import('node:fs')) as unknown as {
      __api: { existsSync: ReturnType<typeof vi.fn> };
    };

    fsMod.__api.existsSync.mockReturnValueOnce(false);
    await LogsCommand.create().execute({
      follow: true,
      category: 'missing',
    } satisfies CommandOptions);
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Log category directory not found')
    );
  });

  it('follow path: processes new log chunk and logs parse errors', async () => {
    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const { Logger } = await import('@config/logger');
    const fsMod = (await import('node:fs')) as unknown as {
      __api: {
        existsSync: ReturnType<typeof vi.fn>;
        statSync: ReturnType<typeof vi.fn>;
        createReadStream: ReturnType<typeof vi.fn>;
      };
    };
    const logMod = (await import('@cli/logger/Logger')) as unknown as {
      __getInstance: () => unknown;
    };
    const instance = logMod.__getInstance() as { parseLogEntry: ReturnType<typeof vi.fn> };

    fsMod.__api.existsSync.mockReturnValue(true);
    fsMod.__api.statSync.mockReturnValueOnce({ size: 10 });

    let onData: ((chunk: string | Buffer) => void) | undefined;
    fsMod.__api.createReadStream.mockReturnValue({
      on: vi.fn((event: string, handler: unknown) => {
        if (event === 'data' && typeof handler === 'function') {
          onData = handler as (chunk: string | Buffer) => void;
        }
      }),
    });

    instance.parseLogEntry
      .mockImplementationOnce((line: string) => ({ timestamp: 't', level: 'info', message: line }))
      .mockImplementationOnce(() => {
        throw new Error('bad line');
      });

    let capturedSigint: (() => void) | undefined;
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: () => void
    ) => {
      if (event === 'SIGINT') capturedSigint = handler;
      return process;
    }) as unknown as typeof process.on);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      void code; //NOSONAR
      return undefined as never;
    }) as unknown as typeof process.exit);

    vi.useFakeTimers();
    await LogsCommand.create().execute({ follow: true, category: 'app' } satisfies CommandOptions);
    await vi.advanceTimersByTimeAsync(1000);

    onData?.('line1\nline2\n');
    expect(Logger.error).toHaveBeenCalledWith('Failed to process log line', expect.any(Error));

    capturedSigint?.();
    expect(exitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
