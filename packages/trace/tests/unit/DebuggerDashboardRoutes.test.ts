import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  registerGet,
  registerGroup,
  registerPost,
  registerDelete,
  useDatabase,
  resolveStorage,
  mergeConfig,
} = vi.hoisted(() => ({
  registerGet: vi.fn(),
  registerGroup: vi.fn((_router, _base, callback: (router: unknown) => void) => {
    callback({});
  }),
  registerPost: vi.fn(),
  registerDelete: vi.fn(),
  useDatabase: vi.fn(() => ({ connection: 'trace-db' })),
  resolveStorage: vi.fn(() => ({ stats: vi.fn() })),
  mergeConfig: vi.fn(() => ({ connection: 'analytics' })),
}));

vi.mock('@zintrust/core', () => ({
  appConfig: { name: 'ZinTrust Test App' },
  Router: {
    get: registerGet,
    group: registerGroup,
    post: registerPost,
    del: registerDelete,
  },
  useDatabase,
}));

vi.mock('../../src/config', () => ({
  TraceConfig: {
    merge: mergeConfig,
  },
}));

vi.mock('../../src/storage', () => ({
  TraceStorage: {
    resolveStorage,
  },
}));

vi.mock('../../src/dashboard/handlers', () => ({
  addMonitoring: vi.fn(),
  clearEntries: vi.fn(),
  getBatch: vi.fn(),
  getEntry: vi.fn(),
  getMonitoring: vi.fn(),
  getStats: vi.fn(),
  listEntries: vi.fn(),
  removeMonitoring: vi.fn(),
  setHandlerStorage: vi.fn(),
}));

import { registerTraceDashboard } from '../../src/dashboard/routes';

describe('registerTraceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>).__zintrust_system_trace_connection_name__;
    useDatabase.mockReturnValue({ connection: 'trace-db' });
    mergeConfig.mockReturnValue({ connection: 'analytics' });
  });

  it('resolves trace storage from the configured connection and mounts routes', () => {
    registerTraceDashboard({} as never, {
      basePath: '/trace',
      middleware: ['admin'],
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'analytics');
    expect(resolveStorage).toHaveBeenCalledWith({ connection: 'trace-db' });
    expect(registerGet).toHaveBeenCalledWith(expect.anything(), '/trace', expect.any(Function), {
      middleware: ['admin'],
    });
  });

  it('prefers an explicit connection override when provided', () => {
    registerTraceDashboard({} as never, {
      connectionName: 'primary',
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'primary');
  });

  it('prefers the resolved runtime trace connection over static config', () => {
    (globalThis as Record<string, unknown>).__zintrust_system_trace_connection_name__ = 'sqlite';

    registerTraceDashboard({} as never, {
      basePath: '/trace',
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'sqlite');
  });
});
