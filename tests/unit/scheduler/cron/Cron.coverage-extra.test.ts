import { afterEach, describe, expect, it } from 'vitest';

import { Cron } from '../../../../src/scheduler/cron/Cron';

describe('Cron (extra coverage)', () => {
  const originalDtf = Intl.DateTimeFormat;

  afterEach(() => {
    // restore
    (Intl as any).DateTimeFormat = originalDtf;
  });

  it('weekdayToDow handles Tue/Fri/Sat/default via mocked Intl parts (unique tz keys)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();

    const makeDtf = (weekday: string) =>
      class {
        formatToParts() {
          return [
            { type: 'weekday', value: weekday },
            { type: 'minute', value: '00' },
            { type: 'hour', value: '00' },
            { type: 'day', value: '01' },
            { type: 'month', value: '01' },
            { type: 'year', value: '2026' },
          ];
        }
      };

    // Note: Cron caches Intl.DateTimeFormat instances per timezone key.
    // Use a unique timeZone string each time so our mocked DateTimeFormat is used.
    (Intl as any).DateTimeFormat = makeDtf('Tue');
    expect(Cron.nextRunAtMs(now, '* * * * *', 'Fake/TZ1')).toBeGreaterThan(now);

    (Intl as any).DateTimeFormat = makeDtf('Fri');
    expect(Cron.nextRunAtMs(now, '* * * * *', 'Fake/TZ2')).toBeGreaterThan(now);

    (Intl as any).DateTimeFormat = makeDtf('Sat');
    expect(Cron.nextRunAtMs(now, '* * * * *', 'Fake/TZ3')).toBeGreaterThan(now);

    (Intl as any).DateTimeFormat = makeDtf('Wed');
    expect(Cron.nextRunAtMs(now, '* * * * *', 'Fake/TZ3b')).toBeGreaterThan(now);

    (Intl as any).DateTimeFormat = makeDtf('WAT');
    expect(Cron.nextRunAtMs(now, '* * * * *', 'Fake/TZ4')).toBeGreaterThan(now);
  });

  it('returns fallback now+60s when cron spec never matches (invalid tokens)', () => {
    // Force Intl path to throw so the search loop uses cheap UTC fallback.
    (Intl as any).DateTimeFormat = class {
      constructor() {
        throw new Error('no intl');
      }
    };

    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    const next = Cron.nextRunAtMs(now, 'a a a a a', 'UTC');
    expect(next).toBe(now + 60_000);
  });
});
