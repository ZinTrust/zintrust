import { Schedule } from '@scheduler/Schedule';
import { describe, expect, it } from 'vitest';

describe('app/Schedules Schedule builder', () => {
  it('builds an everyMinute schedule', () => {
    const schedule = Schedule.define('test.everyMinute', async () => undefined)
      .everyMinute()
      .enabledWhen(true)
      .runOnStart()
      .build();

    expect(schedule.name).toBe('test.everyMinute');
    expect(schedule.intervalMs).toBe(60_000);
    expect(schedule.enabled).toBe(true);
    expect(schedule.runOnStart).toBe(true);
  });

  it('builds an everyMinutes(n) schedule', () => {
    const schedule = Schedule.define('test.everyMinutes', async () => undefined)
      .everyMinutes(2)
      .enabledWhen(false)
      .build();

    expect(schedule.intervalMs).toBe(120_000);
    expect(schedule.enabled).toBe(false);
  });
});
