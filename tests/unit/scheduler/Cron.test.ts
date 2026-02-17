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

  it('parses invalid expressions as any-spec (matches next minute)', () => {
    const now = Date.parse('2026-01-01T00:00:30.000Z');
    const next = Cron.nextRunAtMs(now, 'not a cron', 'UTC');
    expect(new Date(next).toISOString()).toBe('2026-01-01T00:01:00.000Z');
  });

  it('supports */step and range/step fields', () => {
    const spec = Cron.parse('*/15 0-6/2 * * *');
    expect(spec.minute.any).toBe(false);
    expect(spec.hour.any).toBe(false);
  });

  it('treats DOW 7 as Sunday and clamps out-of-range values', () => {
    const spec = Cron.parse('0 0 * * 7,9,-1');
    if (spec.dayOfWeek.any) throw new Error('Expected restricted dayOfWeek');
    expect(spec.dayOfWeek.values.has(0)).toBe(true);
    // 9 clamps to 7, and 7 normalizes to Sunday (0)
    expect(Array.from(spec.dayOfWeek.values)).toEqual([0]);
  });

  it('implements Vixie DOM/DOW semantics (either matches when both restricted)', () => {
    // day-of-month 1, day-of-week Monday (1)
    const expr = '0 0 1 * 1';
    const onFirst = Date.parse('2026-02-01T00:00:00.000Z');
    const onMonday = Date.parse('2026-02-02T00:00:00.000Z');

    // next run from just before each should be that time
    expect(new Date(Cron.nextRunAtMs(onFirst - 1000, expr, 'UTC')).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z'
    );
    expect(new Date(Cron.nextRunAtMs(onMonday - 1000, expr, 'UTC')).toISOString()).toBe(
      '2026-02-02T00:00:00.000Z'
    );
  });

  it('falls back to UTC parts when Intl timezone is invalid', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    const next = Cron.nextRunAtMs(now, '0 0 * * *', 'Invalid/Timezone');
    expect(new Date(next).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
