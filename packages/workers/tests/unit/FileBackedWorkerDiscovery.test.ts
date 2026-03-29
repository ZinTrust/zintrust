import { afterEach, describe, expect, it, vi } from 'vitest';

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { getWorkerDetails, getWorkers } from '../../src/dashboard/workers-api';

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

const writeWorkerModule = (projectRoot: string, fileName = 'DigestWorker.js'): void => {
  const workerDir = path.join(projectRoot, 'app', 'Workers');
  mkdirSync(workerDir, { recursive: true });
  writeFileSync(
    path.join(workerDir, fileName),
    [
      'export const workerDefinition = Object.freeze({',
      "  name: 'digest-worker',",
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
      expect(list.workers[0]?.details?.configuration.queueName).toBe('digest-queue');
      expect(details.details?.configuration.processorSpec).toBe('app/Workers/DigestWorker.js');
      expect(details.details?.configuration.version).toBe('2.3.4');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
