import { afterEach, describe, expect, it, vi } from 'vitest';

import { TraceWriteDiagnostics } from '../../src/storage/TraceWriteDiagnostics';
import { EntryType, type ITraceStorage } from '../../src/types';

const createStorage = (error: Error): ITraceStorage => ({
  addMonitoring: vi.fn(async () => {
    throw error;
  }),
  clear: vi.fn(async () => undefined),
  getBatch: vi.fn(async () => []),
  getEntry: vi.fn(async () => null),
  getMonitoring: vi.fn(async () => []),
  markFamilyStale: vi.fn(async () => undefined),
  prune: vi.fn(async () => 0),
  queryEntries: vi.fn(async () => ({ data: [], total: 0 })),
  removeMonitoring: vi.fn(async () => undefined),
  stats: vi.fn(async () => ({ request: 0 }) as never),
  updateEntry: vi.fn(async () => undefined),
  writeEntry: vi.fn(async () => {
    throw error;
  }),
});

describe('TraceWriteDiagnostics', () => {
  afterEach(() => {
    TraceWriteDiagnostics.reset();
    vi.restoreAllMocks();
  });

  it('logs and tracks storage write degradation with rate limiting', async () => {
    const logger = { warn: vi.fn() };
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    const storage = TraceWriteDiagnostics.wrapStorage(createStorage(new Error('db down')), {
      connectionName: 'mysql-trace',
      logger,
    });

    await expect(
      storage.writeEntry({
        uuid: 'entry',
        batchId: 'batch',
        type: EntryType.QUERY,
        content: { sql: 'select 1' },
        tags: [],
        isLatest: true,
        createdAt: 1,
      })
    ).rejects.toThrow('db down');

    await expect(
      storage.writeEntry({
        uuid: 'entry-2',
        batchId: 'batch',
        type: EntryType.QUERY,
        content: { sql: 'select 2' },
        tags: [],
        isLatest: true,
        createdAt: 2,
      })
    ).rejects.toThrow('db down');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('[trace] Trace storage write degraded', {
      connectionName: 'mysql-trace',
      error: 'db down',
      lastFailureAt: 1000,
      operation: 'writeEntry',
      totalFailures: 1,
      watcherType: 'query',
    });

    expect(TraceWriteDiagnostics.getSnapshot()).toEqual({
      degraded: true,
      lastErrorMessage: 'db down',
      lastFailureAt: 1000,
      totalFailures: 2,
    });

    nowSpy.mockReturnValue(32_000);

    await expect(storage.addMonitoring('slow')).rejects.toThrow('db down');

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenLastCalledWith('[trace] Trace storage write degraded', {
      connectionName: 'mysql-trace',
      error: 'db down',
      lastFailureAt: 32000,
      operation: 'addMonitoring',
      totalFailures: 3,
      watcherType: null,
    });
  });
});
