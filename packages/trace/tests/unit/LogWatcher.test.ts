import { afterEach, describe, expect, it, vi } from 'vitest';

const addSink = vi.fn();

vi.mock('@zintrust/core', () => ({
  Logger: {
    addSink,
  },
}));

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createStorage = () => ({
  writeEntry: vi.fn().mockResolvedValue(undefined),
  updateEntry: vi.fn().mockResolvedValue(undefined),
  markFamilyStale: vi.fn().mockResolvedValue(undefined),
});

describe('LogWatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('skips trace infrastructure proxy failure logs to avoid recursive writes', async () => {
    vi.resetModules();

    let sink:
      | ((level: string, message: string, context?: Record<string, unknown>) => void)
      | undefined;
    addSink.mockImplementation((callback) => {
      sink = callback;
      return () => undefined;
    });

    const { LogWatcher } = await import('../../src/watchers/LogWatcher');
    const storage = createStorage();
    const config = { watchers: { log: true }, logMinLevel: 'info', ignoreRoutes: [] } as any;

    LogWatcher.register({ storage, config } as any);

    sink?.('error', '[MySQLProxyAdapter] Proxy request failed', {
      error: 'MySQL proxy forbidden',
      path: '/zin/mysql/query',
    });
    sink?.('warn', '[trace] Trace storage write degraded', {
      connectionName: 'default',
      error: 'MySQL proxy forbidden',
    });
    await flushAsync();

    expect(storage.writeEntry).not.toHaveBeenCalled();
  });

  it('still records normal application logs', async () => {
    vi.resetModules();

    let sink:
      | ((level: string, message: string, context?: Record<string, unknown>) => void)
      | undefined;
    addSink.mockImplementation((callback) => {
      sink = callback;
      return () => undefined;
    });

    const { LogWatcher } = await import('../../src/watchers/LogWatcher');
    const storage = createStorage();
    const config = { watchers: { log: true }, logMinLevel: 'info', ignoreRoutes: [] } as any;

    LogWatcher.register({ storage, config } as any);

    sink?.('error', 'User login failed', { email: 'user@example.com' });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'log',
        content: expect.objectContaining({
          level: 'error',
          message: 'User login failed',
        }),
      })
    );
  });

  it('skips trace storage query execution logs to avoid recursive trace writes', async () => {
    vi.resetModules();

    let sink:
      | ((level: string, message: string, context?: Record<string, unknown>) => void)
      | undefined;
    addSink.mockImplementation((callback) => {
      sink = callback;
      return () => undefined;
    });

    const { LogWatcher } = await import('../../src/watchers/LogWatcher');
    const storage = createStorage();
    const config = { watchers: { log: true }, logMinLevel: 'debug', ignoreRoutes: [] } as any;

    LogWatcher.register({ storage, config } as any);

    sink?.('debug', 'SQLite query executed', {
      durationMs: 0.12,
      sql: 'INSERT INTO zin_trace_entries_tags (entry_uuid, tag) VALUES (?, ?)',
    });
    await flushAsync();

    expect(storage.writeEntry).not.toHaveBeenCalled();
  });
});
