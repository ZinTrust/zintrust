import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createHealthyWorkersModule = (): {
  loadWorkersModule: ReturnType<typeof vi.fn>;
} => ({
  loadWorkersModule: vi.fn(async () => ({
    WorkerFactory: {
      list: () => ['a', 'b'],
      listPersisted: async () => ['a'],
      listPersistedRecords: async () => [],
      getHealth: async () => ({ score: 99, status: 'healthy' }),
      getMetrics: async () => ({ processed: 1 }),
      get: async () => ({}),
      stop: async () => undefined,
      restart: async () => undefined,
      start: async () => undefined,
      startFromPersisted: async () => undefined,
    },
    WorkerRegistry: { status: () => ({ status: 'running', concurrency: 1 }) },
    HealthMonitor: { getSummary: async () => ({ details: [{ status: 'healthy' }] }) },
    ResourceMonitor: {
      getCurrentUsage: () => ({
        cpu: 1,
        memory: { percent: 2, used: 3 },
        cost: { hourly: 4, daily: 5 },
      }),
    },
  })),
});

const createAlertingWorkersModule = (): {
  loadWorkersModule: ReturnType<typeof vi.fn>;
} => ({
  loadWorkersModule: vi.fn(async () => ({
    WorkerFactory: {
      list: () => ['a'],
      listPersisted: async () => ['a'],
      listPersistedRecords: async () => [],
      getHealth: async () => ({ score: 50, status: 'degraded' }),
      getMetrics: async () => ({ processed: 2 }),
      get: async () => ({}),
      stop: async () => undefined,
      restart: async () => undefined,
      start: async () => undefined,
      startFromPersisted: async () => undefined,
    },
    WorkerRegistry: { status: () => ({ status: 'running', concurrency: 1 }) },
    HealthMonitor: {
      getSummary: async () => ({
        details: [{ status: 'unhealthy' }, { status: 'critical' }, { status: 'other' }],
      }),
    },
    ResourceMonitor: {
      getCurrentUsage: () => ({
        cpu: 1,
        memory: { percent: 2, used: 3 },
        cost: { hourly: 4, daily: 5 },
      }),
    },
  })),
});

const createMissingWorkersModule = (): {
  loadWorkersModule: ReturnType<typeof vi.fn>;
} => ({
  loadWorkersModule: vi.fn(async () => {
    throw new Error('missing-workers');
  }),
});

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('WorkerCommands extra patch coverage', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('loads workers from runtime module and prints summary', async () => {
    vi.doMock('@runtime/WorkersModule', createHealthyWorkersModule);

    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    await WorkerCommands.createWorkerSummaryCommand().execute({});
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Worker System Summary'));
  });

  it('normalizes unhealthy/critical statuses and ignores unknown values', async () => {
    vi.doMock('@runtime/WorkersModule', createAlertingWorkersModule);

    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    await WorkerCommands.createWorkerSummaryCommand().execute({});
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhealthy: 1'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Critical: 1'));
  });

  it('throws CLI error when runtime workers package cannot load', async () => {
    vi.doMock('@runtime/WorkersModule', createMissingWorkersModule);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    await expect(WorkerCommands.createWorkerListCommand().execute({})).rejects.toThrow('exit:1');

    exitSpy.mockRestore();
  });
});
