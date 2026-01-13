import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe('LogsCommand.execute behavior', () => {
  it('displays no logs message when no logs found', async () => {
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
    const { Logger } = await import('@config/logger');
    const infoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});

    vi.doMock('@cli/logger/Logger', () => ({
      Logger: {
        getInstance: () => ({ getLogs: () => [] }),
      },
    }));

    const { LogsCommand } = await import('@cli/commands/LogsCommand');

    const cmd = LogsCommand.create();
    // execute with default options
    cmd.execute({} as any);

    expect(infoSpy).toHaveBeenCalled();
    const calledWith = infoSpy.mock.calls.find((c: any[]) => String(c[0]).includes('No logs'));
    expect(calledWith).toBeDefined();
  });

  it('displays no logs found for level when filtered out', async () => {
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
    const { Logger } = await import('@config/logger');
    const infoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});

    vi.doMock('@cli/logger/Logger', () => ({
      Logger: {
        getInstance: () => ({
          getLogs: () => [{ level: 'debug', message: 'x' }],
          filterByLevel: (_logs: any[], _level: string) => [],
        }),
      },
    }));

    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const cmd = LogsCommand.create();

    cmd.execute({ lines: '10', level: 'warn', category: 'app' } as any);

    expect(infoSpy).toHaveBeenCalled();
    const calledWith = infoSpy.mock.calls.find((c: any[]) =>
      String(c[0]).includes('No logs found with level')
    );
    expect(calledWith).toBeDefined();
  });

  it('clears logs when --clear passed and reports success', async () => {
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn() } }));
    const { Logger } = await import('@config/logger');
    const infoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});

    vi.doMock('@cli/logger/Logger', () => ({
      Logger: {
        getInstance: () => ({ clearLogs: (_cat: string) => true }),
      },
    }));

    const { LogsCommand } = await import('@cli/commands/LogsCommand');
    const cmd = LogsCommand.create();
    cmd.execute({ clear: true, category: 'app' } as any);

    expect(infoSpy).toHaveBeenCalled();
    const calledWith = infoSpy.mock.calls.find((c: any[]) => String(c[0]).includes('Cleared logs'));
    expect(calledWith).toBeDefined();
  });
});
