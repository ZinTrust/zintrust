type CronFieldRange = Readonly<{ min: number; max: number }>;

type CronAllowed = Readonly<{ any: true }> | Readonly<{ any: false; values: ReadonlySet<number> }>;

export type CronSpec = Readonly<{
  minute: CronAllowed;
  hour: CronAllowed;
  dayOfMonth: CronAllowed;
  month: CronAllowed;
  dayOfWeek: CronAllowed;
}>;

const ANY: CronAllowed = Object.freeze({ any: true });

const toInt = (value: string): number | null => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const clamp = (n: number, range: CronFieldRange): number =>
  Math.min(range.max, Math.max(range.min, n));

const expandStep = (step: number, range: CronFieldRange, out: Set<number>): void => {
  for (let i = range.min; i <= range.max; i += step) out.add(i);
};

const expandRange = (trimmed: string, range: CronFieldRange, out: Set<number>): void => {
  const left = trimmed.slice(0, trimmed.indexOf('-'));
  const rest = trimmed.slice(trimmed.indexOf('-') + 1);
  const slashIdx = rest.indexOf('/');

  const right = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const stepRaw = slashIdx === -1 ? null : rest.slice(slashIdx + 1);

  const start = toInt(left);
  const end = toInt(right);
  const step = stepRaw === null ? 1 : toInt(stepRaw);

  if (start === null || end === null || step === null || step <= 0) return;

  const a = clamp(start, range);
  const b = clamp(end, range);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (let i = lo; i <= hi; i += step) out.add(i);
};

const expandPart = (part: string, range: CronFieldRange, out: Set<number>): void => {
  const trimmed = part.trim();
  if (trimmed.length === 0) return;

  if (trimmed.startsWith('*/')) {
    const step = toInt(trimmed.slice(2));
    if (step !== null && step > 0) expandStep(step, range, out);
    return;
  }

  if (trimmed.includes('-')) {
    expandRange(trimmed, range, out);
    return;
  }

  const num = toInt(trimmed);
  if (num !== null) out.add(clamp(num, range));
};

const parseField = (
  raw: string,
  range: CronFieldRange,
  normalize?: (n: number) => number
): CronAllowed => {
  const value = raw.trim();
  if (value === '*' || value.length === 0) return ANY;

  const set = new Set<number>();
  for (const part of value.split(',')) {
    expandPart(part, range, set);
  }

  if (normalize !== undefined) {
    const normalized = new Set<number>();
    for (const n of set) normalized.add(normalize(n));
    return Object.freeze({ any: false, values: normalized });
  }

  return Object.freeze({ any: false, values: set });
};

const matches = (allowed: CronAllowed, value: number): boolean => {
  if (allowed.any) return true;
  return allowed.values.has(value);
};

type ZonedParts = Readonly<{
  minute: number;
  hour: number;
  day: number;
  month: number;
  dow: number;
}>;

const weekdayToDow = (weekdayShort: string): number => {
  switch (weekdayShort) {
    case 'Sun':
      return 0;
    case 'Mon':
      return 1;
    case 'Tue':
      return 2;
    case 'Wed':
      return 3;
    case 'Thu':
      return 4;
    case 'Fri':
      return 5;
    case 'Sat':
      return 6;
    default:
      return 0;
  }
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const key = `en-US|${timeZone}`;
  const cached = dtfCache.get(key);
  if (cached) return cached;

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  dtfCache.set(key, fmt);
  return fmt;
};

const getZonedParts = (date: Date, timeZone: string): ZonedParts => {
  // Fallback to UTC if Intl timeZone support is unavailable.
  try {
    const fmt = getFormatter(timeZone);
    const parts = fmt.formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
      parts.find((p) => p.type === type)?.value;

    const minute = Number.parseInt(get('minute') ?? '0', 10);
    const hour = Number.parseInt(get('hour') ?? '0', 10);
    const day = Number.parseInt(get('day') ?? '1', 10);
    const month = Number.parseInt(get('month') ?? '1', 10);
    const weekday = get('weekday') ?? 'Sun';
    const dow = weekdayToDow(weekday);

    return { minute, hour, day, month, dow };
  } catch {
    return {
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      dow: date.getUTCDay(),
    };
  }
};

const domDowMatches = (spec: CronSpec, parts: ZonedParts): boolean => {
  const domAny = spec.dayOfMonth.any;
  const dowAny = spec.dayOfWeek.any;
  const domOk = matches(spec.dayOfMonth, parts.day);
  const dowOk = matches(spec.dayOfWeek, parts.dow);

  // Vixie cron semantics:
  // - if either DOM or DOW is '*', require the other field to match
  // - if both are restricted, match if either matches
  if (domAny && dowAny) return true;
  if (domAny) return dowOk;
  if (dowAny) return domOk;
  return domOk || dowOk;
};

const matchesSpec = (spec: CronSpec, parts: ZonedParts): boolean => {
  return (
    matches(spec.minute, parts.minute) &&
    matches(spec.hour, parts.hour) &&
    matches(spec.month, parts.month) &&
    domDowMatches(spec, parts)
  );
};

export const Cron = Object.freeze({
  parse(expr: string): CronSpec {
    const raw = String(expr ?? '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length !== 5) {
      // Return an "any" spec for invalid inputs; runner will treat it as "every minute".
      return Object.freeze({
        minute: ANY,
        hour: ANY,
        dayOfMonth: ANY,
        month: ANY,
        dayOfWeek: ANY,
      });
    }

    const [min, hour, dom, month, dow] = parts;

    const normalizeDow = (n: number): number => {
      // allow 7 as Sunday
      if (n === 7) return 0;
      return clamp(n, { min: 0, max: 6 });
    };

    return Object.freeze({
      minute: parseField(min, { min: 0, max: 59 }),
      hour: parseField(hour, { min: 0, max: 23 }),
      dayOfMonth: parseField(dom, { min: 1, max: 31 }),
      month: parseField(month, { min: 1, max: 12 }),
      dayOfWeek: parseField(dow, { min: 0, max: 7 }, normalizeDow),
    });
  },

  nextRunAtMs(nowMs: number, expr: string, timeZone: string = 'UTC'): number {
    const spec = this.parse(expr);
    const base = new Date(nowMs);

    // Cron is minute-resolution; start from next minute boundary.
    base.setUTCSeconds(0, 0);
    base.setTime(base.getTime() + 60_000);

    // Bound search to 366 days (minute granularity). This is defensive; typical crons resolve quickly.
    const maxIterations = 366 * 24 * 60;

    for (let i = 0; i < maxIterations; i++) {
      const parts = getZonedParts(base, timeZone);
      if (matchesSpec(spec, parts)) return base.getTime();
      base.setTime(base.getTime() + 60_000);
    }

    // Fallback: run in 60s.
    return nowMs + 60_000;
  },
});

export default Cron;
