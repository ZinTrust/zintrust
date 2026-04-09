import { describe, expect, it, vi } from 'vitest';

import { TraceContentRedaction } from '../../src/storage/TraceContentRedaction';
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
  stats: vi.fn(async () => ({ request: 0 }) as never),
  updateEntry: vi.fn(async () => undefined),
  writeEntry: vi.fn(async () => undefined),
});

describe('TraceContentRedaction', () => {
  it('masks nested sensitive values before writing entries', async () => {
    const storage = createStorage();
    const wrapped = TraceContentRedaction.wrapStorage(storage, {
      keys: ['password', 'accessToken', 'cardNumber'],
      headers: ['authorization'],
      body: ['secret'],
      query: [],
    });

    await wrapped.writeEntry({
      uuid: 'entry-1',
      batchId: 'batch-1',
      type: EntryType.REQUEST,
      content: {
        authorization: 'Bearer raw-token',
        payload: {
          password: 'plain-text',
          nested: {
            accessToken: 'access-token-value',
            profile: [{ cardNumber: '4242424242424242' }],
          },
          safe: 'value',
        },
      },
      tags: [],
      isLatest: true,
      createdAt: 1,
    });

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: {
          authorization: '****',
          payload: {
            password: '****',
            nested: {
              accessToken: '****',
              profile: [{ cardNumber: '****' }],
            },
            safe: 'value',
          },
        },
      })
    );
  });

  it('masks content updates before persisting patches', async () => {
    const storage = createStorage();
    const wrapped = TraceContentRedaction.wrapStorage(storage, {
      keys: ['password'],
      headers: [],
      body: [],
      query: [],
    });

    await wrapped.updateEntry('entry-2', {
      content: {
        password: 'secret',
        safe: 'ok',
      },
      isLatest: false,
    });

    expect(storage.updateEntry).toHaveBeenCalledWith('entry-2', {
      content: {
        password: '****',
        safe: 'ok',
      },
      isLatest: false,
    });
  });
});
