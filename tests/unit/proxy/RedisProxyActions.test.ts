import type { QueueMonitorContext } from '@proxy/redis/RedisProxyActions';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBullMQDriver: vi.fn(),
  createMetrics: vi.fn(),
  getRecentJobsForQueue: vi.fn(),
  getRecentJobsForSelection: vi.fn(),
  getWorkers: vi.fn(),
  getWorkerDetails: vi.fn(),
  toggleAutoStart: vi.fn(),
  listPersistedRecords: vi.fn(),
  listFileBackedRecords: vi.fn(),
  getPersisted: vi.fn(),
  getHealth: vi.fn(),
  getMetrics: vi.fn(),
}));

vi.mock('@zintrust/queue-monitor/driver', () => ({
  createBullMQDriver: mocks.createBullMQDriver,
}));

vi.mock('@zintrust/queue-monitor/metrics', () => ({
  createMetrics: mocks.createMetrics,
}));

vi.mock('@zintrust/queue-monitor/QueueMonitoringService', () => ({
  getRecentJobsForQueue: mocks.getRecentJobsForQueue,
  getRecentJobsForSelection: mocks.getRecentJobsForSelection,
}));

vi.mock('@zintrust/workers/dashboard/workers-api', () => ({
  getWorkers: mocks.getWorkers,
  getWorkerDetails: mocks.getWorkerDetails,
  toggleAutoStart: mocks.toggleAutoStart,
}));

vi.mock('@zintrust/workers/WorkerFactory', () => ({
  WorkerFactory: {
    listPersistedRecords: mocks.listPersistedRecords,
    listFileBackedRecords: mocks.listFileBackedRecords,
    getPersisted: mocks.getPersisted,
    getHealth: mocks.getHealth,
    getMetrics: mocks.getMetrics,
  },
}));

describe('RedisProxyActions dispatchServiceCommand', () => {
  it.skip('dispatches worker and queue-monitor RPC actions', async () => {
    const { dispatchServiceCommand } = await import('../../../src/proxy/redis/RedisProxyActions');

    const queueMonitor = {
      driver: { close: vi.fn(async () => undefined) },
      metrics: {} as QueueMonitorContext['metrics'],
    } as unknown as QueueMonitorContext;

    mocks.getWorkers.mockResolvedValueOnce(['worker-a']);
    mocks.getRecentJobsForQueue.mockResolvedValueOnce(['job-a']);

    await expect(dispatchServiceCommand('worker', 'getWorkers', {}, queueMonitor)).resolves.toEqual(
      ['worker-a']
    );
    expect(mocks.getWorkers).toHaveBeenCalledTimes(1);

    await expect(
      dispatchServiceCommand(
        'queue-monitor',
        'getRecentJobsForQueue',
        { queue: 'queue-a' },
        queueMonitor
      )
    ).resolves.toEqual(['job-a']);
    expect(mocks.getRecentJobsForQueue).toHaveBeenCalledWith(
      'queue-a',
      queueMonitor.metrics,
      queueMonitor.driver
    );
  });

  it('rejects unsupported services and actions', async () => {
    const { dispatchServiceCommand } = await import('../../../src/proxy/redis/RedisProxyActions');

    const queueMonitor = {
      driver: { close: vi.fn(async () => undefined) },
      metrics: {} as QueueMonitorContext['metrics'],
    } as unknown as QueueMonitorContext;

    await expect(dispatchServiceCommand('redis', 'PING', {}, queueMonitor)).rejects.toThrow(
      'Unsupported RPC service: redis'
    );

    await expect(
      dispatchServiceCommand('worker', 'missingAction', {}, queueMonitor)
    ).rejects.toThrow('Unsupported worker action: missingAction');
  });
});
