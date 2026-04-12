import { describe, expect, it, vi } from 'vitest';

import { TraceContentBudget } from '../../src/storage/TraceContentBudget';
import { EntryType, type ITraceStorage } from '../../src/types';

const createStorage = (): ITraceStorage => ({
  addMonitoring: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
  getBatch: vi.fn(async () => []),
  getEntry: vi.fn(async () => null),
  getMonitoring: vi.fn(async () => []),
  markFamilyStale: vi.fn(async () => undefined),
  prune: vi.fn(async () => 0),
  queryEntries: vi.fn(async () => ({ data: [], total: 0 })),
  removeMonitoring: vi.fn(async () => undefined),
  stats: vi.fn(async () => ({}) as never),
  updateEntry: vi.fn(async () => undefined),
  writeEntry: vi.fn(async () => undefined),
});

describe('TraceContentBudget', () => {
  it('drops oversized top-level request fields while preserving the rest of the trace entry', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(storage);

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

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          method: 'POST',
          url: 'https://api.example.test/login',
          requestBody: expect.stringContaining('Value dropped'),
          responseStatus: 200,
        }),
      })
    );
  });

  it('compacts oversized content patches before updateEntry persists them', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(storage);

    await wrapped.updateEntry('entry-2', {
      content: {
        responseBody: 'y'.repeat(200_000),
        responseStatus: 500,
      },
      isLatest: false,
    });

    expect(storage.updateEntry).toHaveBeenCalledWith('entry-2', {
      content: expect.objectContaining({
        responseBody: expect.stringContaining('Value dropped'),
        responseStatus: 500,
      }),
      isLatest: false,
    });
  });

  it('drops only the oversized nested field while preserving sibling fields', async () => {
    const storage = createStorage();
    const wrapped = TraceContentBudget.wrapStorage(storage);

    await wrapped.writeEntry({
      uuid: 'entry-3',
      batchId: 'batch-1',
      type: EntryType.CLIENT_REQUEST,
      content: {
        a: 'good',
        b: {
          nestedLarge: 'z'.repeat(200_000),
          nestedSmall: 'still here',
        },
        c: 'is ok',
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          a: 'good',
          b: expect.objectContaining({
            nestedLarge: expect.stringContaining('Value dropped'),
            nestedSmall: 'still here',
          }),
          c: 'is ok',
        }),
      })
    );
  });
});
