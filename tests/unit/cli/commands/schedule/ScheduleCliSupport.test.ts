import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  registerDatabases: vi.fn(),
  registerMany: vi.fn(),
  shutdownIfInitialized: vi.fn(async () => undefined),
  resetDatabase: vi.fn(async () => undefined),
  closeLockProvider: vi.fn(async () => undefined),
}));

vi.mock('@config/database', () => ({ databaseConfig: { default: {} } }));
vi.mock('@orm/DatabaseRuntimeRegistration', () => ({
  registerDatabasesFromRuntimeConfig: (...args: any[]) => mocked.registerDatabases(...args),
}));
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    registerMany: (...args: any[]) => mocked.registerMany(...args),
  },
}));

describe('ScheduleCliSupport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registerAll loads core and app schedules and registers both', async () => {
    vi.doMock('@schedules/index', () => ({
      a: { name: 'a', handler: async () => undefined },
      notSchedule: 1,
    }));
    vi.doMock('@app/Schedules', () => ({
      b: { name: 'b', handler: async () => undefined },
      bad: { nope: true },
    }));

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();

    expect(mocked.registerDatabases).toHaveBeenCalledTimes(1);
    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'core');
    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'app');
  });

  it('registerAll tolerates missing app schedules and shutdown is best-effort', async () => {
    vi.doMock('@schedules/index', () => ({ a: { name: 'a', handler: async () => undefined } }));
    vi.doMock('@app/Schedules', () => {
      throw new Error('missing');
    });
    vi.doMock('@orm/ConnectionManager', () => ({
      ConnectionManager: {
        shutdownIfInitialized: (...args: any[]) => mocked.shutdownIfInitialized(...args),
      },
    }));
    vi.doMock('@orm/Database', () => ({
      resetDatabase: (...args: any[]) => mocked.resetDatabase(...args),
    }));
    vi.doMock('@queue/LockProvider', () => ({
      closeLockProvider: (...args: any[]) => mocked.closeLockProvider(...args),
    }));

    const { ScheduleCliSupport } = await import('@cli/commands/schedule/ScheduleCliSupport');
    await ScheduleCliSupport.registerAll();
    await ScheduleCliSupport.shutdownCliResources();

    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'core');
    expect(mocked.registerMany).toHaveBeenCalledWith(expect.any(Array), 'app');
    expect(mocked.shutdownIfInitialized).toHaveBeenCalledTimes(1);
    expect(mocked.resetDatabase).toHaveBeenCalledTimes(1);
    expect(mocked.closeLockProvider).toHaveBeenCalledTimes(1);
  });
});
