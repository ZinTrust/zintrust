import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/WorkerRegistry', () => ({
  WorkerRegistry: {
    listRunning: vi.fn(),
    stop: vi.fn(),
  },
}));

import { ChaosEngineering, type IChaosExperiment } from '../../src/ChaosEngineering';
import { WorkerRegistry } from '../../src/WorkerRegistry';

describe('ChaosEngineering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('runs and completes an experiment', async () => {
    vi.useFakeTimers();
    vi.mocked(WorkerRegistry.listRunning).mockReturnValue(['worker-a']);
    vi.mocked(WorkerRegistry.stop).mockResolvedValue();

    const experiment: IChaosExperiment = {
      name: 'crash-test',
      description: 'Simulate a crash',
      target: { workers: ['worker-a'], percentage: 100 },
      failure: { type: 'crash', config: {} },
      duration: 100,
      safetyLimits: { maxConcurrent: 2, circuitBreaker: false, rollbackOn: [] },
    };

    const id = ChaosEngineering.defineExperiment(experiment);
    await ChaosEngineering.startExperiment(id);

    let status = ChaosEngineering.getExperimentStatus(id);
    expect(status.state).toBe('running');

    await vi.advanceTimersByTimeAsync(150);

    status = ChaosEngineering.getExperimentStatus(id);
    expect(status.state).toBe('completed');
  });
});
