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
  useDatabase: vi.fn(() => ({ connection: 'debugger-db' })),
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
  DebuggerConfig: {
    merge: mergeConfig,
  },
}));

vi.mock('../../src/storage', () => ({
  DebuggerStorage: {
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

import { registerDebuggerDashboard } from '../../src/dashboard/routes';

describe('registerDebuggerDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDatabase.mockReturnValue({ connection: 'debugger-db' });
    mergeConfig.mockReturnValue({ connection: 'analytics' });
  });

  it('resolves debugger storage from the configured connection and mounts routes', () => {
    registerDebuggerDashboard({} as never, {
      basePath: '/debugger',
      middleware: ['admin'],
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'analytics');
    expect(resolveStorage).toHaveBeenCalledWith({ connection: 'debugger-db' });
    expect(registerGet).toHaveBeenCalledWith(expect.anything(), '/debugger', expect.any(Function), {
      middleware: ['admin'],
    });
  });

  it('prefers an explicit connection override when provided', () => {
    registerDebuggerDashboard({} as never, {
      connectionName: 'primary',
    });

    expect(useDatabase).toHaveBeenCalledWith(undefined, 'primary');
  });
});
