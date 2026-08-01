import { describe, expect, it, vi } from 'vitest';

import { TraceContentBudget } from '../../src/storage/TraceContentBudget';
import { EntryType, type ITraceConfig, type ITraceStorage } from '../../src/types';

const baseConfig: ITraceConfig = {
  enabled: true,
  connection: undefined,
  observeConnection: undefined,
  pruneAfterHours: 24,
  ignoreRoutes: [],
  ignorePaths: [],
  slowQueryThreshold: 100,
  captureNotFound: true,
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

const flushScheduledTraceWork = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (): void => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      resolve();
    };

    channel.port2.postMessage(undefined);
  });
};

describe('TraceContentBudget', () => {
  it('yields fallback persistence until the next event-loop turn', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(storage, baseConfig);

    const pendingWrite = wrapped.writeEntry({
      uuid: 'entry-0',
      batchId: 'batch-1',
      type: EntryType.CLIENT_REQUEST,
      content: {
        responseBody: 'z'.repeat(200_000),
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    await Promise.resolve();

    expect(storage.writeEntry).not.toHaveBeenCalled();

    await flushScheduledTraceWork();

    await pendingWrite;

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
  });

  it('keeps write promises pending until the deferred storage write finishes', async () => {
    let releaseWrite = (): void => undefined;
    const storage = createStorage();
    storage.writeEntry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        })
    );

    const wrapped = TraceContentBudget.wrapStorage(storage, baseConfig);
    let settled = false;

    const pendingWrite = wrapped
      .writeEntry({
        uuid: 'entry-promise',
        batchId: 'batch-1',
        type: EntryType.CLIENT_REQUEST,
        content: {
          responseBody: 'z'.repeat(200_000),
        },
        tags: [],
        isLatest: true,
        createdAt: 1,
      })
      .then(() => {
        settled = true;
      });

    await Promise.resolve();
    expect(settled).toBe(false);

    await flushScheduledTraceWork();

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    releaseWrite();
    await pendingWrite;

    expect(settled).toBe(true);
  });

  it('replaces oversized content immediately when queue dispatch is not configured', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(storage, baseConfig);

    await wrapped.writeEntry({
      uuid: 'entry-1',
      batchId: 'batch-1',
      type: EntryType.CLIENT_REQUEST,
      content: {
        method: 'POST',
        url: 'https://api.example.test/login',
        requestHeaders: { authorization: 'Bearer token' },
        requestBody: 'x'.repeat(200_000),
        responseStatus: 200,
        responseBody: { ok: true },
        duration: 42,
        hostname: 'node',
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    await flushScheduledTraceWork();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          __traceNotice: 'Trace content exceeded budget and was replaced.',
          dropped: true,
          valueType: 'object',
        }),
      })
    );
  });

  it('replaces oversized patches immediately when queue dispatch is not configured', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(storage, baseConfig);

    await wrapped.updateEntry('entry-2', {
      content: {
        responseBody: 'y'.repeat(200_000),
        responseStatus: 500,
      },
      isLatest: false,
    });

    await flushScheduledTraceWork();

    expect(storage.updateEntry).toHaveBeenCalledWith('entry-2', {
      content: expect.objectContaining({
        __traceNotice: 'Trace content exceeded budget and was replaced.',
        dropped: true,
        valueType: 'object',
      }),
      isLatest: false,
    });
  });

  it('passes smaller content through unchanged without a queue', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(storage, baseConfig);

    await wrapped.writeEntry({
      uuid: 'entry-3',
      batchId: 'batch-1',
      type: EntryType.CLIENT_REQUEST,
      content: {
        a: 'good',
        b: {
          nestedSmall: 'still here',
        },
        c: 'is ok',
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    await flushScheduledTraceWork();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          a: 'good',
          b: expect.objectContaining({
            nestedSmall: 'still here',
          }),
          c: 'is ok',
        }),
      })
    );
  });

  it('offloads trace writes to the configured queue and skips direct persistence on the request path', async () => {
    const storage = createStorage();
    const enqueue = vi.fn(async () => 'job-1');

    const wrapped = TraceContentBudget.wrapStorage(
      storage,
      {
        ...baseConfig,
        contentDispatch: {
          ...baseConfig.contentDispatch,
          driver: 'redis',
          worker: {
            ...baseConfig.contentDispatch.worker,
            enabled: false,
          },
        },
      },
      {
        queue: {
          get: vi.fn(() => ({ enqueue })),
        },
      }
    );

    const pendingWrite = wrapped.writeEntry({
      uuid: 'entry-4',
      batchId: 'batch-1',
      type: EntryType.LOG,
      content: {
        message: 'queued',
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    await Promise.resolve();

    expect(enqueue).not.toHaveBeenCalled();

    await pendingWrite;

    expect(enqueue).toHaveBeenCalledWith(
      'trace-content',
      expect.objectContaining({
        operation: 'write',
      })
    );
    expect(storage.writeEntry).not.toHaveBeenCalled();
  });

  it('uses bounded top-level compaction in the worker path for oversized queued content', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(
      storage,
      {
        ...baseConfig,
        contentDispatch: {
          ...baseConfig.contentDispatch,
          driver: 'redis',
          worker: {
            ...baseConfig.contentDispatch.worker,
            enabled: true,
          },
        },
      },
      {
        queueWorkerApi: {
          createQueueWorker: <TPayload>(options: { handle(payload: TPayload): Promise<void> }) => ({
            runOnce: async () => {
              await options.handle({
                operation: 'write',
                entry: {
                  uuid: 'entry-worker',
                  batchId: 'batch-1',
                  type: EntryType.CLIENT_REQUEST,
                  content: Object.fromEntries(
                    Array.from({ length: 10 }, (_, index) => [
                      `field${String(index)}`,
                      'v'.repeat(15_000),
                    ])
                  ),
                  tags: [],
                  isLatest: true,
                  createdAt: 1,
                },
              } as TPayload);

              return 1;
            },
          }),
        },
      }
    );

    expect(wrapped).toBeDefined();

    await vi.waitFor(() => {
      expect(storage.writeEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            __traceNotice: expect.stringContaining('top-level field(s) were dropped.'),
          }),
        })
      );
    });
  });
});
