import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const getBoolMock = vi.fn();
const getIntMock = vi.fn();
const registerPersistenceAdapterMock = vi.fn();
const clearPersistenceAdapterMock = vi.fn();

vi.mock('@config/env', () => ({
  Env: {
    get: getMock,
    getBool: getBoolMock,
    getInt: getIntMock,
  },
}));

vi.mock('@queue/JobStateTracker', () => ({
  JobStateTracker: {
    registerPersistenceAdapter: registerPersistenceAdapterMock,
    clearPersistenceAdapter: clearPersistenceAdapterMock,
  },
}));

describe('autoRegisterJobStateTrackerPersistenceFromEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getBoolMock.mockImplementation((key: string, fallback: boolean) => {
      if (key === 'JOB_TRACKING_ENABLED') return true;
      if (key === 'JOB_TRACKING_PERSISTENCE_ENABLED') return true;
      return fallback;
    });

    getMock.mockImplementation((key: string, fallback: string) => {
      if (key === 'JOB_TRACKING_PERSISTENCE_DRIVER') return 'database';
      if (key === 'JOB_TRACKING_DB_CONNECTION') return 'default';
      if (key === 'JOB_TRACKING_DB_TABLE') return 'zintrust_jobs';
      if (key === 'JOB_TRACKING_DB_TRANSITIONS_TABLE') return 'zintrust_job_transitions';
      return fallback;
    });

    getIntMock.mockImplementation((_key: string, fallback: number) => fallback);
  });

  it('registers DB adapter when enabled', async () => {
    const { autoRegisterJobStateTrackerPersistenceFromEnv } =
      await import('@/tools/queue/JobStateTrackerDbPersistence');

    const registered = autoRegisterJobStateTrackerPersistenceFromEnv();
    expect(registered).toBe(true);
    expect(registerPersistenceAdapterMock).toHaveBeenCalledTimes(1);
    expect(clearPersistenceAdapterMock).not.toHaveBeenCalled();
  });

  it('clears adapter and returns false when persistence is disabled', async () => {
    getBoolMock.mockImplementation((key: string, fallback: boolean) => {
      if (key === 'JOB_TRACKING_ENABLED') return true;
      if (key === 'JOB_TRACKING_PERSISTENCE_ENABLED') return false;
      return fallback;
    });

    const { autoRegisterJobStateTrackerPersistenceFromEnv } =
      await import('@/tools/queue/JobStateTrackerDbPersistence');

    const registered = autoRegisterJobStateTrackerPersistenceFromEnv();
    expect(registered).toBe(false);
    expect(clearPersistenceAdapterMock).toHaveBeenCalledTimes(1);
    expect(registerPersistenceAdapterMock).not.toHaveBeenCalled();
  });
});
