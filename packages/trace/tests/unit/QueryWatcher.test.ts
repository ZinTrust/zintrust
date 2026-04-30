import { afterEach, describe, expect, it, vi } from 'vitest';

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createStorage = () => ({
  writeEntry: vi.fn().mockResolvedValue(undefined),
  updateEntry: vi.fn().mockResolvedValue(undefined),
  markFamilyStale: vi.fn().mockResolvedValue(undefined),
});

describe('QueryWatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips trace tag-table writes to avoid recursive query tracing', async () => {
    vi.resetModules();

    let afterQueryHandler:
      | ((query: string, params: unknown[], duration: number) => void)
      | undefined;
    const db = {
      onAfterQuery: vi.fn(
        (handler: (query: string, params: unknown[], duration: number) => void) => {
          afterQueryHandler = handler;
        }
      ),
      offAfterQuery: vi.fn(),
    };

    const { QueryWatcher } = await import('../../src/watchers/QueryWatcher');
    const storage = createStorage();
    const config = {
      watchers: { query: true },
      ignoreRoutes: [],
      captureQueryBindings: true,
      slowQueryThreshold: 100,
    } as any;

    QueryWatcher.register({ storage, config, db } as any);

    afterQueryHandler?.(
      'INSERT OR IGNORE INTO zin_trace_entries_tags (entry_uuid, tag) VALUES (?, ?)',
      ['trace-uuid', 'slow'],
      0.25
    );
    await flushAsync();

    expect(storage.writeEntry).not.toHaveBeenCalled();
  });

  it('still records non-trace queries', async () => {
    vi.resetModules();

    let afterQueryHandler:
      | ((query: string, params: unknown[], duration: number) => void)
      | undefined;
    const db = {
      onAfterQuery: vi.fn(
        (handler: (query: string, params: unknown[], duration: number) => void) => {
          afterQueryHandler = handler;
        }
      ),
      offAfterQuery: vi.fn(),
    };

    const { QueryWatcher } = await import('../../src/watchers/QueryWatcher');
    const storage = createStorage();
    const config = {
      watchers: { query: true },
      ignoreRoutes: [],
      captureQueryBindings: true,
      slowQueryThreshold: 100,
    } as any;

    QueryWatcher.register({ storage, config, db } as any);

    afterQueryHandler?.('SELECT * FROM users WHERE id = ?', [42], 12.5);
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'query',
        content: expect.objectContaining({
          statement: 'SELECT * FROM users WHERE id = ?',
        }),
      })
    );
  });

  it('records queries even when the current request path is ignored', async () => {
    vi.resetModules();

    let afterQueryHandler:
      | ((query: string, params: unknown[], duration: number) => void)
      | undefined;
    const db = {
      onAfterQuery: vi.fn(
        (handler: (query: string, params: unknown[], duration: number) => void) => {
          afterQueryHandler = handler;
        }
      ),
      offAfterQuery: vi.fn(),
    };

    const { TraceContext } = await import('../../src/context');
    TraceContext.setRequestContextImpl({
      peek: () => ({ path: '/health' }),
    });

    const { QueryWatcher } = await import('../../src/watchers/QueryWatcher');
    const storage = createStorage();
    const config = {
      watchers: { query: true },
      ignoreRoutes: ['/trace', '/health', '/ping'],
      ignorePaths: [],
      captureQueryBindings: true,
      slowQueryThreshold: 100,
    } as any;

    QueryWatcher.register({ storage, config, db } as any);

    afterQueryHandler?.('select 1 as ok', [], 2);
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'query',
        content: expect.objectContaining({
          sql: 'select 1 as ok',
          statement: 'select 1 as ok',
        }),
      })
    );

    TraceContext.setRequestContextImpl({ peek: () => undefined });
  });
});
