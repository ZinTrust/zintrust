import { afterEach, describe, expect, it, vi } from 'vitest';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { getWorkerDetails, getWorkers } from '../../src/dashboard/workers-api';

const queueMonitorState = vi.hoisted(() => ({
  failSnapshot: false,
}));

vi.mock('@zintrust/queue-monitor', () => ({
  QueueMonitor: {
    create: () => ({
      getSnapshot: () =>
        queueMonitorState.failSnapshot
          ? Promise.reject(new Error('Queue monitor unavailable'))
          : Promise.resolve({ queues: [] }),
    }),
  },
}));

vi.unmock('@zintrust/workers');
const workersModule = await import('@zintrust/workers');
const WorkerFactory = workersModule.WorkerFactory as unknown as {
  getFileBackedRecord: (
    name: string
  ) => Promise<import('../../src/storage/WorkerStore').WorkerRecord | null>;
  listFileBackedRecords: () => Promise<import('../../src/storage/WorkerStore').WorkerRecord[]>;
  resetPersistence: () => Promise<void>;
  shutdown: () => Promise<void>;
};

const originalProjectRoot = process.env['ZINTRUST_PROJECT_ROOT'];
const originalPersistenceDriver = process.env['WORKER_PERSISTENCE_DRIVER'];
const originalQueueDriver = process.env['QUEUE_DRIVER'];

const createTempProjectRoot = (): string => mkdtempSync(path.join(tmpdir(), 'zintrust-workers-'));

const writeWorkerModule = (
  projectRoot: string,
  fileName = 'DigestWorker.js',
  options?: { includeExplicitName?: boolean }
): void => {
  const workerDir = path.join(projectRoot, 'app', 'Workers');
  mkdirSync(workerDir, { recursive: true });
  const includeExplicitName = options?.includeExplicitName ?? true;
  writeFileSync(
    path.join(workerDir, fileName),
    [
      'export const workerDefinition = Object.freeze({',
      ...(includeExplicitName ? ["  name: 'digest-worker',"] : []),
      "  queueName: 'digest-queue',",
      "  version: '2.3.4',",
      '  autoStart: true,',
      '  concurrency: 4,',
      '  activeStatus: true,',
      "  processorSpec: 'app/Workers/DigestWorker.js',",
      '});',
      '',
      'export default async function digestWorkerProcessor() {',
      '  return undefined;',
      '}',
      '',
      'export const ZinTrustProcessor = digestWorkerProcessor;',
    ].join('\n'),
    'utf8'
  );
};

describe('file-backed worker discovery', () => {
  afterEach(async () => {
    vi.useRealTimers();
    queueMonitorState.failSnapshot = false;

    if (originalProjectRoot === undefined) {
      delete process.env['ZINTRUST_PROJECT_ROOT'];
    } else {
      process.env['ZINTRUST_PROJECT_ROOT'] = originalProjectRoot;
    }

    if (originalPersistenceDriver === undefined) {
      delete process.env['WORKER_PERSISTENCE_DRIVER'];
    } else {
      process.env['WORKER_PERSISTENCE_DRIVER'] = originalPersistenceDriver;
    }

    if (originalQueueDriver === undefined) {
      delete process.env['QUEUE_DRIVER'];
    } else {
      process.env['QUEUE_DRIVER'] = originalQueueDriver;
    }

    await WorkerFactory.shutdown();
    await WorkerFactory.resetPersistence();
  });

  it('discovers worker records from project files when persistence is empty', async () => {
    const projectRoot = createTempProjectRoot();
    try {
      process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;
      process.env['WORKER_PERSISTENCE_DRIVER'] = 'memory';
      process.env['QUEUE_DRIVER'] = 'memory';
      writeWorkerModule(projectRoot);

      const record = await WorkerFactory.getFileBackedRecord('digest-worker');
      const records = await WorkerFactory.listFileBackedRecords();

      expect(record).not.toBeNull();
      expect(record?.queueName).toBe('digest-queue');
      expect(record?.version).toBe('2.3.4');
      expect(record?.processorSpec).toBe('app/Workers/DigestWorker.js');
      expect(records.map((entry) => entry.name)).toContain('digest-worker');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('uses file-backed workers for list and details when persistence has no records', async () => {
    const projectRoot = createTempProjectRoot();
    try {
      process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;
      process.env['WORKER_PERSISTENCE_DRIVER'] = 'memory';
      process.env['QUEUE_DRIVER'] = 'memory';
      writeWorkerModule(projectRoot);

      const list = await getWorkers({ page: 1, limit: 20, includeDetails: true });
      const details = await getWorkerDetails('digest-worker');

      expect(list.workers).toHaveLength(1);
      expect(list.workers[0]?.name).toBe('digest-worker');
      expect(list.workers[0]?.driver).toBe('memory');
      expect(list.workers[0]?.details?.configuration['queueName']).toBe('digest-queue');
      expect(details.details?.configuration['processorSpec']).toBe('app/Workers/DigestWorker.js');
      expect(details.details?.configuration['version']).toBe('2.3.4');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('preserves configured queue driver when queue statistics fail', async () => {
    const projectRoot = createTempProjectRoot();
    try {
      queueMonitorState.failSnapshot = true;
      process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;
      process.env['WORKER_PERSISTENCE_DRIVER'] = 'memory';
      process.env['QUEUE_DRIVER'] = 'redis';
      writeWorkerModule(projectRoot);

      const list = await getWorkers({ page: 1, limit: 20, includeDetails: false });

      expect(list.queueData.driver).toBe('redis');
      expect(list.queueData.totalQueues).toBe(0);
      expect(list.queueData.totalJobs).toBe(0);
      expect(list.workers).toHaveLength(1);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('normalizes acronym-heavy worker filenames without regex backtracking patterns', async () => {
    const projectRoot = createTempProjectRoot();
    try {
      process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;
      process.env['WORKER_PERSISTENCE_DRIVER'] = 'memory';
      process.env['QUEUE_DRIVER'] = 'memory';
      writeWorkerModule(projectRoot, 'HTTPDigestWorker.js', { includeExplicitName: false });

      const record = await WorkerFactory.getFileBackedRecord('http-digest-worker');
      const records = await WorkerFactory.listFileBackedRecords();

      expect(record).not.toBeNull();
      expect(record?.name).toBe('http-digest-worker');
      expect(records.map((entry) => entry.name)).toContain('http-digest-worker');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
