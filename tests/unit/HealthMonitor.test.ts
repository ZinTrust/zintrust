import type { Worker } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthMonitor } from '../../packages/workers/src/HealthMonitor';
import { WorkerFactory } from '../../packages/workers/src/WorkerFactory';

// Mock WorkerFactory
vi.mock('../../packages/workers/src/WorkerFactory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/workers/src/WorkerFactory')>();
  return {
    ...actual,
    WorkerFactory: {
      ...actual.WorkerFactory,
      updateStatus: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Mock BullMQ Worker
const mockWorker = {
  isPaused: vi.fn().mockReturnValue(false),
  isClosing: vi.fn().mockReturnValue(false),
  isRunning: vi.fn().mockReturnValue(true),
  client: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
} as unknown as Worker;

describe('HealthMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Reset internal state
    HealthMonitor.unregister('test-worker');
    HealthMonitor.unregister('failing-worker');
    HealthMonitor.unregister('recovering-worker');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should transition to failed state after consecutive failures', async () => {
    const workerName = 'failing-worker';
    const error = new Error('Redis Connection Lost');

    // Mock ping to fail
    ((await mockWorker.client!).ping as any).mockRejectedValue(error);

    HealthMonitor.register(workerName, mockWorker, 'test-queue');

    // Run timers to trigger multiple checks
    // 1st Check
    await vi.advanceTimersByTimeAsync(10000);
    // 2nd Check
    await vi.advanceTimersByTimeAsync(6000);
    // 3rd Check
    await vi.advanceTimersByTimeAsync(6000);
    // 4th Check
    await vi.advanceTimersByTimeAsync(6000);

    // Expect WorkerFactory.updateStatus to have been called with 'failed'
    // It captures error.message string
    expect(WorkerFactory.updateStatus).toHaveBeenCalledWith(
      workerName,
      'failed',
      'Redis Connection Lost'
    );
  });

  it('should recover from failure', async () => {
    const workerName = 'recovering-worker';

    // Initially failing
    ((await mockWorker.client!).ping as any).mockRejectedValue(new Error('Fail'));
    HealthMonitor.register(workerName, mockWorker, 'test-queue');

    // Force failure state
    await vi.advanceTimersByTimeAsync(30000); // Trigger enough failures

    expect(WorkerFactory.updateStatus).toHaveBeenCalledWith(workerName, 'failed', 'Fail');
    (WorkerFactory.updateStatus as any).mockClear();

    // Now recover
    ((await mockWorker.client!).ping as any).mockResolvedValue('PONG');

    // Advance time for next check
    await vi.advanceTimersByTimeAsync(10000);

    // Should transition to healthy (running)
    expect(WorkerFactory.updateStatus).toHaveBeenCalledWith(workerName, 'running', undefined);
  });
});
