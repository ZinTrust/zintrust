import { describe, expect, it } from 'vitest';

import { Cron } from '@/scheduler/cron/Cron';

describe('Cron', () => {
  it('computes next run at local midnight in America/New_York (winter offset)', () => {
    // 2026-01-01T04:59Z is 23:59 on 2025-12-31 in America/New_York (UTC-5)
    const now = Date.parse('2026-01-01T04:59:00.000Z');
    const next = Cron.nextRunAtMs(now, '0 0 * * *', 'America/New_York');

    // Next local midnight should be 2026-01-01T05:00Z
    expect(new Date(next).toISOString()).toBe('2026-01-01T05:00:00.000Z');
  });
});
