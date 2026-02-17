import { describe, expect, it } from 'vitest';

import { Schedule } from '../../../src/scheduler/Schedule';

describe('ScheduleBuilder (coverage)', () => {
  it('everyHours and timezone setters update schedule fields', () => {
    const schedule = Schedule.define('s', async () => undefined)
      .everyHours(2.9)
      .timezone('  UTC  ')
      .build();

    expect(schedule.intervalMs).toBe(2 * 3_600_000);
    expect(schedule.timezone).toBe('UTC');
  });

  it('everyHour is an alias for everyHours(1)', () => {
    const schedule = Schedule.define('s2', async () => undefined)
      .everyHour()
      .build();
    expect(schedule.intervalMs).toBe(1 * 3_600_000);
  });
});
