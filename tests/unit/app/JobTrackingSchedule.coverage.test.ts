import { describe, expect, it, vi } from 'vitest';

const cleanupMock = vi.fn(async () => undefined);

vi.mock('@schedules/job-tracking-cleanup', () => ({
  cleanupJobTrackingOnce: (...args: unknown[]) => cleanupMock(...args),
}));

import JobTrackingCleanupSchedule from '../../../app/Schedules/JobTracking';

describe('JobTracking cleanup schedule (coverage extras)', () => {
  it('invokes cleanupJobTrackingOnce when handler runs', async () => {
    await JobTrackingCleanupSchedule.handler(undefined as any);
    expect(cleanupMock).toHaveBeenCalledTimes(1);
  });
});
