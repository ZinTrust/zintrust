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

  it('builds a schedule with cron + timezone + jitter/backoff + leaderOnly fields', () => {
    const schedule = Schedule.define('test.cron', async () => undefined)
      .cron('*/5 * * * *', { timezone: 'UTC' })
      .jitterMs(250)
      .backoff({ initialMs: 1000, maxMs: 30000, factor: 2 })
      .leaderOnly()
      .build();

    expect(schedule.name).toBe('test.cron');
    expect(schedule.cron).toBe('*/5 * * * *');
    expect(schedule.timezone).toBe('UTC');
    expect(schedule.jitterMs).toBe(250);
    expect(schedule.backoff).toEqual({ initialMs: 1000, maxMs: 30000, factor: 2 });
    expect(schedule.leaderOnly).toBe(true);
  });
});
