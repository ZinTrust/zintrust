import { afterEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@config/logger';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@zintrust/workers', () => ({
  createQueueWorker: () => ({
    processOne: async () => true,
    processAll: async () => true,
    startWorker: async () => true,
  }),
  WorkerFactory: {
    list: vi.fn(),
    listPersisted: vi.fn(),
    getHealth: vi.fn(),
    getMetrics: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    start: vi.fn(),
  },
  WorkerRegistry: {
    status: vi.fn(),
  },
  HealthMonitor: {
    getSummary: vi.fn(),
  },
  ResourceMonitor: {
    getCurrentUsage: vi.fn(),
  },
}));

describe('WorkerCommands', () => {
  const createExitMock = () => () => {
    throw new Error('exit');
  };

  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('lists workers and formats the table', async () => {
    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    const workersModule = await import('@zintrust/workers');
    const workerFactory = workersModule.WorkerFactory as unknown as {
      listPersisted: ReturnType<typeof vi.fn>;
    };
    const workerRegistry = workersModule.WorkerRegistry as unknown as {
      status: ReturnType<typeof vi.fn>;
    };

    workerFactory.listPersisted.mockResolvedValue(['alpha', 'beta']);
    workerRegistry.status.mockImplementation((name: string) => ({
      status: 'running',
      version: name === 'alpha' ? '1.0.0' : '2.0.0',
      queueName: 'default',
      concurrency: 2,
    }));

    const cmd = WorkerCommands.createWorkerListCommand();
    await cmd.execute({});

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total Workers: 2'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Name'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Concurrency'));
  });

  it('prints when no workers are found', async () => {
    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    const workersModule = await import('@zintrust/workers');
    const workerFactory = workersModule.WorkerFactory as unknown as {
      listPersisted: ReturnType<typeof vi.fn>;
    };

    workerFactory.listPersisted.mockResolvedValue([]);

    const cmd = WorkerCommands.createWorkerListCommand();
    await cmd.execute({});

    expect(logSpy).toHaveBeenCalledWith('No workers found.');
  });

  it('prints worker status details', async () => {
    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    const workersModule = await import('@zintrust/workers');
    const workerFactory = workersModule.WorkerFactory as unknown as {
      getHealth: ReturnType<typeof vi.fn>;
      getMetrics: ReturnType<typeof vi.fn>;
    };
    const workerRegistry = workersModule.WorkerRegistry as unknown as {
      status: ReturnType<typeof vi.fn>;
    };

    workerRegistry.status.mockReturnValue({
      status: 'running',
      version: '1.2.3',
      queueName: 'default',
      region: 'us-east-1',
      startedAt: 'now',
      concurrency: 3,
    });
    workerFactory.getHealth.mockResolvedValue({ score: 92, status: 'healthy' });
    workerFactory.getMetrics.mockResolvedValue({ processed: 10 });

    const cmd = WorkerCommands.createWorkerStatusCommand();
    await cmd.execute({ args: ['alpha'] });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Worker: alpha'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Health Score: 92'));
  });

  it('exits when starting a worker without a name', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    const cmd = WorkerCommands.createWorkerStartCommand();

    await expect(cmd.execute({ args: [] })).rejects.toThrow('exit');
    expect(Logger.error).toHaveBeenCalledWith('Error: Worker name is required');

    exitSpy.mockRestore();
  });

  it('handles worker stop failures', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    const workersModule = await import('@zintrust/workers');
    const workerFactory = workersModule.WorkerFactory as unknown as {
      stop: ReturnType<typeof vi.fn>;
    };
    workerFactory.stop.mockRejectedValue(new Error('boom'));

    const cmd = WorkerCommands.createWorkerStopCommand();
    await expect(cmd.execute({ args: ['alpha'] })).rejects.toThrow('exit');

    expect(Logger.error).toHaveBeenCalledWith('worker:stop command failed', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('Error: boom');

    exitSpy.mockRestore();
  });

  it('prints worker summary', async () => {
    const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
    const workersModule = await import('@zintrust/workers');
    const workerFactory = workersModule.WorkerFactory as unknown as {
      list: ReturnType<typeof vi.fn>;
    };
    const healthMonitor = workersModule.HealthMonitor as unknown as {
      getSummary: ReturnType<typeof vi.fn>;
    };
    const resourceMonitor = workersModule.ResourceMonitor as unknown as {
      getCurrentUsage: ReturnType<typeof vi.fn>;
    };

    workerFactory.list.mockReturnValue(['alpha', 'beta']);
    healthMonitor.getSummary.mockReturnValue([
      { status: 'healthy' },
      { status: 'degraded' },
      { status: 'healthy' },
    ]);
    resourceMonitor.getCurrentUsage.mockReturnValue({
      cpu: 12.5,
      memory: { percent: 42.5, used: 1024 * 1024 * 1024 },
      cost: { hourly: 0.5, daily: 12.5 },
    });

    const cmd = WorkerCommands.createWorkerSummaryCommand();
    await cmd.execute({});

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Worker System Summary'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('CPU: 12.5%'));
  });

  describe('Error Handling Coverage', () => {
    it('should handle worker:list command failure and exit process', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
      const workersModule = await import('@zintrust/workers');
      const workerFactory = workersModule.WorkerFactory as unknown as {
        listPersisted: ReturnType<typeof vi.fn>;
      };

      workerFactory.listPersisted.mockRejectedValue(new Error('List failed'));

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(createExitMock());

      const cmd = WorkerCommands.createWorkerListCommand();

      await expect(cmd.execute({})).rejects.toThrow('exit');
      expect(Logger.error).toHaveBeenCalledWith('worker:list command failed', expect.any(Error));

      exitSpy.mockRestore();
    });

    it('should handle missing worker name in worker:status command', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(createExitMock());

      const cmd = WorkerCommands.createWorkerStatusCommand();

      await expect(cmd.execute({ args: [] })).rejects.toThrow('exit');
      expect(Logger.error).toHaveBeenCalledWith('Error: Worker name is required');

      exitSpy.mockRestore();
    });

    it('should handle worker:status command failure and exit process', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
      const workersModule = await import('@zintrust/workers');
      const workerRegistry = workersModule.WorkerRegistry as unknown as {
        status: ReturnType<typeof vi.fn>;
      };

      workerRegistry.status.mockImplementation(() => {
        throw new Error('Status failed');
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(createExitMock());

      const cmd = WorkerCommands.createWorkerStatusCommand();

      await expect(cmd.execute({ args: ['alpha'] })).rejects.toThrow('exit');
      expect(Logger.error).toHaveBeenCalledWith('worker:status command failed', expect.any(Error));

      exitSpy.mockRestore();
    });

    it('should handle missing worker name in worker:restart command', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(createExitMock());
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const cmd = WorkerCommands.createWorkerRestartCommand();

      await expect(cmd.execute({ args: [] })).rejects.toThrow('exit');
      expect(consoleSpy).toHaveBeenCalledWith('Error: Worker name is required');

      exitSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should handle worker:restart command failure and exit process', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
      const workersModule = await import('@zintrust/workers');
      const workerFactory = workersModule.WorkerFactory as unknown as {
        restart: ReturnType<typeof vi.fn>;
      };

      workerFactory.restart.mockRejectedValue(new Error('Restart failed'));

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(createExitMock());

      const cmd = WorkerCommands.createWorkerRestartCommand();

      await expect(cmd.execute({ args: ['alpha'] })).rejects.toThrow('exit');
      expect(Logger.error).toHaveBeenCalledWith('worker:restart command failed', expect.any(Error));
      expect(errorSpy).toHaveBeenCalledWith('Error: Restart failed');

      exitSpy.mockRestore();
    });

    it('should handle missing worker name in worker:stop command', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(createExitMock());

      const cmd = WorkerCommands.createWorkerStopCommand();

      await expect(cmd.execute({ args: [] })).rejects.toThrow('exit');
      expect(errorSpy).toHaveBeenCalledWith('Error: Worker name is required');

      exitSpy.mockRestore();
    });

    it('should handle worker:stop command failure and exit process', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
      const workersModule = await import('@zintrust/workers');
      const workerFactory = workersModule.WorkerFactory as unknown as {
        stop: ReturnType<typeof vi.fn>;
      };

      workerFactory.stop.mockRejectedValue(new Error('Stop failed'));

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(createExitMock());

      const cmd = WorkerCommands.createWorkerStopCommand();

      await expect(cmd.execute({ args: ['alpha'] })).rejects.toThrow('exit');
      expect(Logger.error).toHaveBeenCalledWith('worker:stop command failed', expect.any(Error));
      expect(errorSpy).toHaveBeenCalledWith('Error: Stop failed');

      exitSpy.mockRestore();
    });

    it('should handle worker:start command success', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
      const workersModule = await import('@zintrust/workers');
      const workerFactory = workersModule.WorkerFactory as unknown as {
        start: ReturnType<typeof vi.fn>;
      };

      workerFactory.start.mockResolvedValue(undefined);

      const cmd = WorkerCommands.createWorkerStartCommand();
      await cmd.execute({ args: ['alpha'] });
    });

    it('should handle worker:stop command success', async () => {
      const { WorkerCommands } = await import('@cli/commands/WorkerCommands');
      const workersModule = await import('@zintrust/workers');
      const workerFactory = workersModule.WorkerFactory as unknown as {
        stop: ReturnType<typeof vi.fn>;
      };

      workerFactory.stop.mockResolvedValue(undefined);

      const cmd = WorkerCommands.createWorkerStopCommand();
      await cmd.execute({ args: ['alpha'] });

      expect(logSpy).toHaveBeenCalledWith('✓ Worker "alpha" stopped successfully');
    });
  });
});
