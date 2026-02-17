import { JobStateTracker } from '@/index';
import { Logger } from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => {
  return {
    Logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('JobStateTracker (branches)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    vi.stubEnv('JOB_TRACKING_ENABLED', '1');
    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', '0');

    JobStateTracker.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    JobStateTracker.reset();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('normalizes pendingRecovery attempts and includes lastErrorCode when provided', async () => {
    await JobStateTracker.pendingRecovery({
      queueName: 'q',
      jobId: 'j',
      attempts: -10,
      maxAttempts: 3.8,
      retryAt: '2026-01-01T00:00:01.000Z',
      error: { message: 'x', code: 'E_CODE' },
    });

    const record = JobStateTracker.get('q', 'j');
    expect(record?.status).toBe('pending_recovery');
    expect(record?.attempts).toBe(0);
    expect(record?.maxAttempts).toBe(3);
    expect(record?.lastErrorCode).toBe('E_CODE');
  });

  it('prunes oldest jobs when limit exceeded', async () => {
    vi.stubEnv('JOB_TRACKING_MAX_JOBS', '1');

    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'old' });
    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'new' });

    expect(JobStateTracker.get('q', 'old')).toBeUndefined();
    expect(JobStateTracker.get('q', 'new')).toBeDefined();
  });

  it('swallows persistence adapter errors and warns', async () => {
    vi.stubEnv('JOB_TRACKING_PERSISTENCE_ENABLED', '1');

    JobStateTracker.registerPersistenceAdapter({
      upsertJob: vi.fn().mockRejectedValue(new Error('db down')),
      insertTransition: vi.fn().mockRejectedValue(new Error('db down')),
    });

    await JobStateTracker.enqueued({ queueName: 'q', jobId: 'p1' });

    const warnCalls = (Logger.warn as unknown as { mock: { calls: unknown[] } }).mock.calls;
    expect(warnCalls.length).toBeGreaterThan(0);
  });
});
