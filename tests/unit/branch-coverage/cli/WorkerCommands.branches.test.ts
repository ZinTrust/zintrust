/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tryImportProjectWorkerEntrypoint: vi.fn(),
  loadWorkersRuntimeModule: vi.fn(),
  diagnosticsCollect: vi.fn(),
  diagnosticsLog: vi.fn(),
  diagnosticsRenderLines: vi.fn(),
  diagnosticsHasBlockingIssues: vi.fn(),
  diagnosticsCreateCliError: vi.fn(),
  factory: {
    list: vi.fn(),
    listPersisted: vi.fn(),
    listPersistedRecords: vi.fn(),
    listFileBackedRecords: vi.fn(),
    getHealth: vi.fn(),
    getMetrics: vi.fn(),
    get: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    start: vi.fn(),
    startFromPersisted: vi.fn(),
  },
  registry: { status: vi.fn(), start: vi.fn() },
  healthMonitor: { getSummary: vi.fn() },
  resourceMonitor: { getCurrentUsage: vi.fn() },
  selectAutoStartNames: undefined as undefined | ((...args: unknown[]) => unknown),
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() },
}));

vi.mock('@runtime/WorkerProjectAutoImports', () => ({
  WorkerProjectAutoImports: {
    tryImportProjectWorkerEntrypoint: (...args: unknown[]) =>
      mocks.tryImportProjectWorkerEntrypoint(...args),
  },
}));

vi.mock('@runtime/WorkersModule', () => ({
  loadWorkersModule: (...args: unknown[]) => mocks.loadWorkersRuntimeModule(...args),
}));

vi.mock('@cli/services/WorkerStartupDiagnostics', () => ({
  WorkerStartupDiagnostics: {
    collect: (...args: unknown[]) => mocks.diagnosticsCollect(...args),
    log: (...args: unknown[]) => mocks.diagnosticsLog(...args),
    renderLines: (...args: unknown[]) => mocks.diagnosticsRenderLines(...args),
    hasBlockingIssues: (...args: unknown[]) => mocks.diagnosticsHasBlockingIssues(...args),
    createCliError: (...args: unknown[]) => mocks.diagnosticsCreateCliError(...args),
  },
}));

const workersModule = () => ({
  WorkerFactory: mocks.factory,
  WorkerRegistry: mocks.registry,
  HealthMonitor: mocks.healthMonitor,
  ResourceMonitor: mocks.resourceMonitor,
  ...(mocks.selectAutoStartNames ? { selectAutoStartNames: mocks.selectAutoStartNames } : {}),
});

const report = {
  flags: {},
  issues: [],
  missingEnvKeys: [],
  envStatus: [],
  firstFault: null,
  logPointers: [],
  nextSteps: [],
};

describe('WorkerCommands uncovered branch coverage', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  const exitOnCall = () => {
    exitSpy.mockImplementation(() => {
      throw new Error('exit');
    });
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    mocks.tryImportProjectWorkerEntrypoint.mockResolvedValue({ ok: false, reason: 'not-found' });
    mocks.loadWorkersRuntimeModule.mockImplementation(async () => workersModule());
    mocks.diagnosticsCollect.mockReturnValue(report);
    mocks.diagnosticsRenderLines.mockReturnValue(['line']);
    mocks.diagnosticsHasBlockingIssues.mockReturnValue(false);
    mocks.diagnosticsCreateCliError.mockImplementation((message: string) => new Error(message));

    mocks.factory.list.mockReturnValue([]);
    mocks.factory.listPersisted.mockResolvedValue([]);
    mocks.factory.listPersistedRecords.mockResolvedValue([]);
    mocks.factory.listFileBackedRecords.mockResolvedValue([]);
    mocks.factory.getHealth.mockResolvedValue({});
    mocks.factory.getMetrics.mockResolvedValue({});
    mocks.factory.get.mockResolvedValue(null);
    mocks.factory.startFromPersisted.mockResolvedValue(undefined);
    mocks.factory.start.mockResolvedValue(undefined);
    mocks.factory.restart.mockResolvedValue(undefined);
    mocks.factory.stop.mockResolvedValue(undefined);
    mocks.registry.status.mockReturnValue(null);
    mocks.healthMonitor.getSummary.mockResolvedValue(undefined);
    mocks.resourceMonitor.getCurrentUsage.mockReturnValue({
      cpu: 0,
      memory: { percent: 0, used: 0 },
      cost: { hourly: 0, daily: 0 },
    });
    mocks.selectAutoStartNames = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  const load = async () => {
    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    return WorkerCommands;
  };

  it('warns about failed project entrypoint imports with and without error details', async () => {
    const { Logger } = await import('@config/logger');

    mocks.tryImportProjectWorkerEntrypoint.mockResolvedValueOnce({
      ok: false,
      reason: 'import-failed',
    });
    mocks.tryImportProjectWorkerEntrypoint.mockResolvedValueOnce({
      ok: false,
      reason: 'import-failed',
      errorMessage: 'broken import',
    });

    const WorkerCommands = await load();
    await WorkerCommands.createWorkerListCommand().execute({});
    vi.resetModules();
    const fresh = await load();
    await fresh.createWorkerListCommand().execute({});

    expect(Logger.warn).toHaveBeenCalledWith(
      'Project worker entrypoint import failed: Unknown error'
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      'Project worker entrypoint import failed: broken import'
    );
  });

  it('throws a CLI error when the optional workers module cannot be loaded', async () => {
    mocks.loadWorkersRuntimeModule.mockRejectedValueOnce(new Error('missing package'));
    exitOnCall();

    const WorkerCommands = await load();
    await expect(WorkerCommands.createWorkerListCommand().execute({})).rejects.toThrow('exit');

    const { Logger } = await import('@config/logger');
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load optional package'),
      expect.any(Error)
    );
  });

  it('reuses lazily created worker APIs on repeated commands', async () => {
    mocks.factory.listPersisted.mockResolvedValue(['alpha']);
    mocks.registry.status.mockReturnValue(null);
    mocks.factory.getHealth.mockResolvedValue(null);
    mocks.factory.getMetrics.mockResolvedValue({});

    const WorkerCommands = await load();
    await WorkerCommands.createWorkerListCommand().execute({});
    await WorkerCommands.createWorkerListCommand().execute({});
    await WorkerCommands.createWorkerStatusCommand().execute({ args: ['alpha'] });
    mocks.factory.getHealth.mockResolvedValueOnce({ score: 12, status: 'healthy' });
    await WorkerCommands.createWorkerStatusCommand().execute({ args: ['alpha'] });
    await WorkerCommands.createWorkerSummaryCommand().execute({});
    await WorkerCommands.createWorkerSummaryCommand().execute({});

    expect(mocks.loadWorkersRuntimeModule).toHaveBeenCalledTimes(4);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Health Score: N/A');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Health Status: N/A');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Region: N/A');
  });

  it('normalizes health summaries from arrays, objects, and unknown values', async () => {
    const summaries = [
      [{ status: 'healthy' }, { status: 'unknown' }, null, 'nope', { status: 'critical' }],
      { details: [{ status: 'degraded' }, { status: 'unhealthy' }, {}] },
      { details: 'not-an-array' },
      undefined,
    ];

    const WorkerCommands = await load();
    for (const summary of summaries) {
      mocks.healthMonitor.getSummary.mockResolvedValueOnce(summary);
      await WorkerCommands.createWorkerSummaryCommand().execute({});
    }

    const text = logSpy.mock.calls.flat().join('\n');
    expect(text).toContain('Healthy: 1');
    expect(text).toContain('Critical: 1');
    expect(text).toContain('Degraded: 1');
    expect(text).toContain('Unhealthy: 1');
  });

  it('skips auto-start when WORKER_AUTO_START is false and logs diagnostics once per failure', async () => {
    const { Logger } = await import('@config/logger');
    vi.stubEnv('WORKER_AUTO_START', 'false');

    const WorkerCommands = await load();
    await WorkerCommands.createWorkerStartAllCommand().execute({});
    expect(Logger.info).toHaveBeenCalledWith(
      'Skipping auto-start because WORKER_AUTO_START is false.'
    );

    vi.stubEnv('WORKER_AUTO_START', 'true');
    mocks.factory.listPersistedRecords.mockResolvedValue([
      { name: 'one', autoStart: true, activeStatus: true },
      { name: 'two', autoStart: true, activeStatus: true },
    ]);
    mocks.factory.listPersisted.mockResolvedValue(['one', 'two']);
    mocks.factory.startFromPersisted.mockRejectedValue(new Error('cannot start'));

    await WorkerCommands.createWorkerStartAllCommand().execute({});

    expect(mocks.diagnosticsLog).toHaveBeenCalledTimes(1);
    expect(Logger.info).toHaveBeenCalledWith(
      'Worker start-all summary',
      expect.objectContaining({ total: 2, failed: 2 })
    );
  });

  it('polls for persisted workers in containers mode before starting them', async () => {
    vi.stubEnv('WORKER_AUTO_START', 'true');
    vi.stubEnv('RUNTIME_MODE', 'containers');
    mocks.factory.listPersisted
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['alpha']);
    mocks.factory.listPersistedRecords.mockResolvedValue([
      { name: 'alpha', autoStart: true, activeStatus: true },
    ]);

    const timeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((callback: () => void) => {
        callback();
        return 0;
      }) as never);

    try {
      const WorkerCommands = await load();
      await WorkerCommands.createWorkerStartAllCommand().execute({});
    } finally {
      timeoutSpy.mockRestore();
    }

    const { Logger } = await import('@config/logger');
    expect(Logger.info).toHaveBeenCalledWith(
      'No persisted workers found. Waiting for workers to be registered... (Polling every 10s)'
    );
    expect(Logger.info).toHaveBeenCalledWith('Found 1 workers. Proceeding to start.');
    expect(mocks.factory.startFromPersisted).toHaveBeenCalledWith('alpha');
  });

  it('skips, restarts, and fails registered workers based on their running state', async () => {
    vi.stubEnv('WORKER_AUTO_START', 'true');
    mocks.factory.listPersisted.mockResolvedValue([
      'running',
      'stale',
      'fresh',
      'not-an-object',
      'no-running-fn',
    ]);
    mocks.factory.listPersistedRecords.mockResolvedValue([
      { name: 'running', autoStart: true, activeStatus: true },
      { name: 'stale', autoStart: true, activeStatus: true },
      { name: 'fresh', autoStart: true, activeStatus: true },
      { name: 'not-an-object', autoStart: true, activeStatus: true },
      { name: 'no-running-fn', autoStart: true, activeStatus: true },
    ]);
    mocks.factory.listFileBackedRecords.mockResolvedValue([
      { name: 'running', autoStart: true, activeStatus: true },
      { name: 'fresh', autoStart: true, activeStatus: true },
    ]);
    mocks.factory.get.mockImplementation(async (name: string) => {
      if (name === 'running') return { worker: { isRunning: () => true } };
      if (name === 'stale') {
        return { worker: { isRunning: () => false, isPaused: () => false } };
      }
      if (name === 'fresh') return undefined;
      if (name === 'no-running-fn') return { worker: {} };
      return 'not-an-object';
    });
    mocks.factory.restart.mockRejectedValueOnce(new Error('restart failed'));

    const WorkerCommands = await load();
    await WorkerCommands.createWorkerStartAllCommand().execute({});

    const { Logger } = await import('@config/logger');
    expect(mocks.factory.restart).toHaveBeenCalledWith('stale');
    expect(mocks.factory.startFromPersisted).toHaveBeenCalledWith('fresh');
    expect(mocks.factory.restart).toHaveBeenCalledWith('not-an-object');
    expect(mocks.diagnosticsLog).toHaveBeenCalledTimes(1);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to restart stale worker'),
      expect.any(Error)
    );
    expect(Logger.info).toHaveBeenCalledWith(
      'Worker start-all summary',
      expect.objectContaining({ total: 5, skipped: 1, started: 3, failed: 1 })
    );
  });

  it('applies file-backed records and delegate selection when available', async () => {
    vi.stubEnv('WORKER_AUTO_START', 'true');
    mocks.factory.listPersistedRecords.mockResolvedValue([
      { name: 'persisted', autoStart: false, activeStatus: true },
    ]);
    mocks.factory.listFileBackedRecords.mockResolvedValue([
      { name: 'one', autoStart: true, activeStatus: true },
      { name: 'one', autoStart: true, activeStatus: true },
      { name: 'disabled', autoStart: true, activeStatus: false },
      { name: 'inactive', autoStart: false, activeStatus: true },
    ]);
    mocks.factory.get.mockResolvedValue(null);

    const WorkerCommands = await load();
    await WorkerCommands.createWorkerStartAllCommand().execute({});
    expect(mocks.factory.startFromPersisted).toHaveBeenCalledTimes(1);

    mocks.factory.startFromPersisted.mockClear();
    mocks.selectAutoStartNames = vi.fn(() => ({ names: ['delegated'], source: 'file' }));
    vi.resetModules();
    const delegated = await load();
    await delegated.createWorkerStartAllCommand().execute({});
    expect(mocks.factory.startFromPersisted).toHaveBeenCalledWith('delegated');
  });

  it('reports no eligible workers and handles container poll errors', async () => {
    vi.stubEnv('WORKER_AUTO_START', 'true');
    mocks.factory.listPersistedRecords.mockResolvedValue([]);

    const { Logger } = await import('@config/logger');
    const WorkerCommands = await load();
    await WorkerCommands.createWorkerStartAllCommand().execute({});
    expect(Logger.info).toHaveBeenCalledWith(
      'No auto-start eligible persisted or file-backed workers found.'
    );

    vi.stubEnv('RUNTIME_MODE', 'containers');
    mocks.factory.listPersistedRecords.mockResolvedValue([
      { name: 'alpha', autoStart: true, activeStatus: true },
    ]);
    mocks.factory.listPersisted
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce('poll error')
      .mockResolvedValueOnce(['alpha']);
    const timeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((callback: () => void) => {
        callback();
        return 0;
      }) as never);
    try {
      await WorkerCommands.createWorkerStartAllCommand().execute({});
    } finally {
      timeoutSpy.mockRestore();
    }
    expect(Logger.warn).toHaveBeenCalledWith(
      'Error checking for persisted workers (retrying in 10s):',
      'poll error'
    );
  });

  it('renders doctor output as JSON or lines and exits only for blocking issues', async () => {
    const WorkerCommands = await load();

    await WorkerCommands.createWorkerDoctorCommand().execute({ json: true });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(report, null, 2));

    await WorkerCommands.createWorkerDoctorCommand().execute({});
    expect(logSpy).toHaveBeenCalledWith('line');
    expect(exitSpy).not.toHaveBeenCalled();

    mocks.diagnosticsHasBlockingIssues.mockReturnValue(true);
    exitOnCall();
    await expect(
      WorkerCommands.createWorkerDoctorCommand().execute({ json: true })
    ).rejects.toThrow('exit');
  });
});
