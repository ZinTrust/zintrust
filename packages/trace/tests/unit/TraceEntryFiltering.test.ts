import { describe, expect, it, vi } from 'vitest';

import { TraceContext } from '../../src/context';
import { TraceEntryFiltering } from '../../src/storage/TraceEntryFiltering';
import { EntryType, type ITraceConfig, type ITraceStorage } from '../../src/types';

const baseConfig: ITraceConfig = {
  enabled: true,
  connection: undefined,
  observeConnection: undefined,
  pruneAfterHours: 24,
  ignoreRoutes: ['/trace'],
  ignorePaths: ['.js', '/queue-monitor'],
  slowQueryThreshold: 100,
  captureCachePayloads: false,
  captureQueryBindings: true,
  logMinLevel: 'info',
  contentDispatch: {
    driver: undefined,
    queueName: 'trace-content',
    enqueueTimeoutMs: 25,
    worker: {
      enabled: false,
      intervalMs: 1000,
      maxDurationMs: 250,
      concurrency: 1,
    },
  },
  watchers: {},
  redaction: {
    keys: [],
    headers: [],
    body: [],
    query: [],
  },
};

const createStorage = (): ITraceStorage => ({
  addMonitoring: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
  getBatch: vi.fn(async () => []),
  getEntry: vi.fn(async () => null),
  getMonitoring: vi.fn(async () => []),
  markFamilyStale: vi.fn(async () => undefined),
  prune: vi.fn(async () => 0),
  queryBatchEntries: vi.fn(async () => ({
    entries: [],
    total: 0,
    counts: {},
    page: 1,
    perPage: 10,
  })),
  queryEntries: vi.fn(async () => ({ data: [], total: 0 })),
  removeMonitoring: vi.fn(async () => undefined),
  stats: vi.fn(async () => ({}) as never),
  updateEntry: vi.fn(async () => undefined),
  writeEntry: vi.fn(async () => undefined),
});

describe('TraceEntryFiltering', () => {
  it('drops request entries whose uri matches ignorePaths before persistence', async () => {
    const storage = createStorage();
    const wrapped = TraceEntryFiltering.wrapStorage(storage, baseConfig);

    await wrapped.writeEntry({
      uuid: 'entry-1',
      batchId: 'batch-1',
      type: EntryType.REQUEST,
      content: {
        method: 'GET',
        uri: '/assets/app.js',
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    expect(storage.writeEntry).not.toHaveBeenCalled();
  });

  it('keeps non-request entries in a batch even when the related request uri is ignored', async () => {
    const storage = createStorage();
    const wrapped = TraceEntryFiltering.wrapStorage(storage, baseConfig);

    await wrapped.writeEntry({
      uuid: 'entry-request',
      batchId: 'batch-2',
      type: EntryType.REQUEST,
      content: {
        method: 'GET',
        uri: '/queue-monitor/api/events',
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    await wrapped.writeEntry({
      uuid: 'entry-log',
      batchId: 'batch-2',
      type: EntryType.LOG,
      content: {
        level: 'info',
        message: 'should be suppressed',
        hostname: 'node',
      },
      tags: [],
      isLatest: true,
      createdAt: 2,
    });

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'entry-log',
        type: EntryType.LOG,
      })
    );
  });

  it('keeps non-request entries when the live request context path is ignored', async () => {
    const storage = createStorage();
    const wrapped = TraceEntryFiltering.wrapStorage(storage, baseConfig);

    TraceContext.setRequestContextImpl({
      current: () => ({ path: '/trace/dashboard' }),
    });

    await wrapped.writeEntry({
      uuid: 'entry-3',
      batchId: 'batch-3',
      type: EntryType.LOG,
      content: {
        level: 'info',
        message: 'ignored through request context',
        hostname: 'node',
      },
      tags: [],
      isLatest: true,
      createdAt: 3,
    });

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: 'entry-3',
        type: EntryType.LOG,
      })
    );

    TraceContext.setRequestContextImpl({
      current: () => ({}),
    });
  });
});
