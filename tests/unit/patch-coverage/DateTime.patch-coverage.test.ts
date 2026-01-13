import { DateTime } from '@time/DateTime';
import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: DateTime', () => {
  it('formats tokens and exposes basic getters', () => {
    const dt = DateTime.fromComponents(2024, 2, 3, 4, 5, 6);

    // Format hits most token replacements.
    const formatted = dt.format('YYYY-YY MMMM MMM MM-M DD-D HH-H mm-m ss-s SSS-S');
    expect(formatted).toContain('2024-24');
    expect(formatted).toContain('February');
    expect(formatted).toContain('Feb');
    expect(formatted).toContain('02-2');
    expect(formatted).toContain('03-3');

    expect(dt.getYear()).toBe(2024);
    expect(dt.getMonth()).toBe(1);
    expect(dt.getDate()).toBe(3);
    expect(dt.getHours()).toBe(4);
    expect(dt.getMinutes()).toBe(5);
    expect(dt.getSeconds()).toBe(6);

    // ISO/RFC helpers
    expect(dt.toISO()).toBe(dt.toRFC3339());
  });

  it('covers ago() thresholds deterministically', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const now = DateTime.now();

    expect(DateTime.fromTimestamp(now.getTime() - 500).ago()).toBe('just now');
    expect(DateTime.fromTimestamp(now.getTime() - 2_000).ago()).toContain('seconds ago');
    expect(DateTime.fromTimestamp(now.getTime() - 2 * 60_000).ago()).toContain('minutes ago');
    expect(DateTime.fromTimestamp(now.getTime() - 2 * 3_600_000).ago()).toContain('hours ago');
    expect(DateTime.fromTimestamp(now.getTime() - 2 * 86_400_000).ago()).toContain('days ago');
    expect(DateTime.fromTimestamp(now.getTime() - 2 * 604_800_000).ago()).toContain('weeks ago');
    expect(DateTime.fromTimestamp(now.getTime() - 2 * 2_592_000_000).ago()).toContain('months ago');
    expect(DateTime.fromTimestamp(now.getTime() - 2 * 31_536_000_000).ago()).toContain('years ago');

    vi.useRealTimers();
  });

  it('covers relative() both past and future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const base = DateTime.now();

    // other is after base -> "in ..."
    expect(base.relative(DateTime.fromTimestamp(base.getTime() + 2_000).toDate())).toContain('in');

    // other is before base -> "... ago"
    expect(base.relative(DateTime.fromTimestamp(base.getTime() - 2_000).toDate())).toContain('ago');

    vi.useRealTimers();
  });

  it('covers relative() threshold buckets (minutes/hours/days/weeks/months/years)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const base = DateTime.now();

    // Future buckets
    expect(base.relative(DateTime.fromTimestamp(base.getTime() + 2 * 60_000).toDate())).toContain(
      'minutes'
    );
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() + 2 * 3_600_000).toDate())
    ).toContain('hours');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() + 2 * 86_400_000).toDate())
    ).toContain('days');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() + 2 * 604_800_000).toDate())
    ).toContain('weeks');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() + 2 * 2_592_000_000).toDate())
    ).toContain('months');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() + 2 * 31_536_000_000).toDate())
    ).toContain('years');

    // Past buckets
    expect(base.relative(DateTime.fromTimestamp(base.getTime() - 2 * 60_000).toDate())).toContain(
      'minutes'
    );
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() - 2 * 3_600_000).toDate())
    ).toContain('hours');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() - 2 * 86_400_000).toDate())
    ).toContain('days');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() - 2 * 604_800_000).toDate())
    ).toContain('weeks');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() - 2 * 2_592_000_000).toDate())
    ).toContain('months');
    expect(
      base.relative(DateTime.fromTimestamp(base.getTime() - 2 * 31_536_000_000).toDate())
    ).toContain('years');

    vi.useRealTimers();
  });

  it('covers add/compare/diff/boundary helpers', () => {
    const base = DateTime.fromComponents(2024, 3, 15, 12, 30, 0);

    const added = base.addDays(1).addHours(2).addMinutes(3).addSeconds(4).addMonths(1).addYears(1);
    expect(added.isAfter(base)).toBe(true);
    expect(base.isBefore(added)).toBe(true);

    const sameDayDifferentTime = DateTime.fromComponents(2024, 3, 15, 0, 0, 0);
    expect(base.isSame(sameDayDifferentTime)).toBe(true);

    const start = base.addDays(-1);
    const end = base.addDays(1);
    expect(base.isBetween(start, end)).toBe(true);

    expect(base.diffMs(base)).toBe(0);
    expect(base.diffSeconds(base)).toBe(0);
    expect(base.diffMinutes(base)).toBe(0);
    expect(base.diffHours(base)).toBe(0);
    expect(base.diffDays(base)).toBe(0);

    const sod = base.startOfDay();
    expect(sod.getHours()).toBe(0);
    const eod = base.endOfDay();
    expect(eod.getHours()).toBe(23);

    const som = base.startOfMonth();
    expect(som.getDate()).toBe(1);
    const eom = base.endOfMonth();
    expect(eom.getDate()).toBeGreaterThanOrEqual(28);

    // Clone and day helpers
    const clone = base.clone();
    expect(clone.getTime()).toBe(base.getTime());
    expect(clone.getDayOfWeek()).toBeGreaterThanOrEqual(0);
    expect(clone.getDayOfYear()).toBeGreaterThanOrEqual(1);
  });

  it('parse rejects invalid date strings', () => {
    expect(() => DateTime.parse('not-a-date')).toThrow();
  });

  it('parse accepts valid ISO strings', () => {
    const dt = DateTime.parse('2024-01-02T03:04:05.006Z');
    expect(dt.getYear()).toBe(2024);
    expect(dt.getMilliseconds()).toBe(6);
  });

  it('create() returns a DateTime wrapper', () => {
    const dt = DateTime.create(new Date('2024-01-02T03:04:05.006Z'));
    expect(dt.getYear()).toBe(2024);
  });
});
