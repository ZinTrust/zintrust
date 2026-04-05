import { describe, expect, it, vi } from 'vitest';

const cleanupMock = vi.fn(async () => undefined);

vi.mock('@schedules/job-tracking-cleanup', () => ({
  cleanupJobTrackingOnce: (...args: unknown[]) => cleanupMock(...args),
}));

describe('JobTracking cleanup schedule (coverage extras)', () => {
  it('invokes cleanupJobTrackingOnce when handler runs', async () => {
    const originalLockProvider = process.env.JOB_TRACKING_CLEANUP_LOCK_PROVIDER;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    process.env.JOB_TRACKING_CLEANUP_LOCK_PROVIDER = 'memory';
    vi.resetModules();

    try {
      const { default: JobTrackingCleanupSchedule } =
        await import('../../../app/Schedules/JobTracking');
      await JobTrackingCleanupSchedule.handler(undefined as any);
      expect(cleanupMock).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      debugSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      if (originalLockProvider === undefined) {
        delete process.env.JOB_TRACKING_CLEANUP_LOCK_PROVIDER;
      } else {
        process.env.JOB_TRACKING_CLEANUP_LOCK_PROVIDER = originalLockProvider;
      }
    }
  });
});
