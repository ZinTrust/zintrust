import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useDatabaseMock = vi.fn();

vi.mock('@orm/Database', () => ({
  useDatabase: (...args: unknown[]) => useDatabaseMock(...args),
}));

import { JobReconciliationRunner } from '@/index';

describe('JobReconciliationRunner (persistence coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDatabaseMock.mockReset();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', '1');
    vi.stubEnv('JOB_TRACKING_DB_TABLE', 'zintrust_jobs');
    vi.stubEnv('JOB_RECONCILIATION_STALE_MS', '1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('reconcileFromPersistence returns persisted candidate count', async () => {
    const tableApi = {
      select: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue([
        { queue_name: 'q', job_id: 'a', updated_at: '2026-01-01 00:00:00' },
        { queue_name: 'q', job_id: 'b', updated_at: '2026-01-01 00:00:00' },
      ]),
    };

    useDatabaseMock.mockReturnValue({
      table: vi.fn(() => tableApi),
    });

    const out = await JobReconciliationRunner.reconcileFromPersistence(10);
    expect(out).toBe(2);
  });
});
