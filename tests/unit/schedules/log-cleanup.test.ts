import LogCleanupSchedule from '@/schedules/log-cleanup';
import * as LoggerModule from '@config/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('log-cleanup schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is configured with an interval and disabled/enabled based on Env', () => {
    expect(typeof LogCleanupSchedule.intervalMs).toBe('number');
    // enabled depends on env; just ensure the property exists
    expect(LogCleanupSchedule.enabled === true || LogCleanupSchedule.enabled === false).toBe(true);
  });

  it('invokes Logger.cleanLogsOnce when handler runs', async () => {
    const spy = vi.spyOn(LoggerModule, 'cleanLogsOnce').mockResolvedValue([] as any);

    await LogCleanupSchedule.handler();

    expect(spy).toHaveBeenCalled();
  });
});
