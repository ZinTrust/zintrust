import { describe, expect, it } from 'vitest';

import type { WorkerStatus } from '@zintrust/core';
import { WorkerRegistry } from '../../src/WorkerRegistry';

const createInstance = (name: string) => ({
  metadata: {
    name,
    status: 'stopped' as WorkerStatus,
    version: '1.0.0',
    region: 'local',
    queueName: 'queue',
    concurrency: 1,
    activeStatus: true,
    startedAt: null,
    stoppedAt: null,
    lastProcessedAt: null,
    restartCount: 0,
    processedCount: 0,
    errorCount: 0,
    lockKey: null,
    priority: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    circuitState: 'closed' as const,
    queues: ['queue'],
    plugins: [],
    datacenter: 'local',
    canaryPercentage: 0,
    config: {},
  },
  instance: null,
  start: () => undefined,
  stop: async () => undefined,
  drain: async () => undefined,
  sleep: async () => undefined,
  wakeup: () => undefined,
  getStatus: () => 'stopped' as WorkerStatus,
  getHealth: () => 'green' as const,
});

describe('WorkerRegistry active status', () => {
  it('excludes inactive registrations from list', () => {
    const name = 'inactive-worker';

    WorkerRegistry.register({
      name,
      config: {},
      activeStatus: false,
      factory: async () => createInstance(name),
    });

    const listed = WorkerRegistry.list();
    expect(listed).not.toContain(name);

    WorkerRegistry.unregister(name);
  });

  it('prevents starting inactive workers', async () => {
    const name = 'inactive-start-worker';

    WorkerRegistry.register({
      name,
      config: {},
      activeStatus: false,
      factory: async () => createInstance(name),
    });

    await expect(WorkerRegistry.start(name)).rejects.toThrow('inactive');

    WorkerRegistry.unregister(name);
  });
});
