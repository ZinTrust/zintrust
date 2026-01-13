/**
 * DateTime - Immutable Date/Time Utilities
 * Provides chainable, type-safe date/time operations with multiple format support
 */

import { ErrorFactory } from '@exceptions/ZintrustError';

/**
 * DateTime interface defining all available operations
 */
export interface IDateTime {
  /**
   * Get the underlying Date object
   */
  toDate(): Date;

  /**
   * Format the date using pattern tokens
   * Supported tokens: YYYY, YY, MMMM, MMM, MM, M, DD, D, HH, H, mm, ss, SSS
   */
  format(pattern: string): string;

  /**
   * Convert to ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ)
   */
  toISO(): string;

  /**
   * Convert to RFC 3339 string (same as ISO 8601)
   */
  toRFC3339(): string;

  /**
   * Get human-readable relative time (e.g., "2 hours ago", "in 3 days")
   */
  ago(): string;

  /**
   * Get relative time from a specific date
   */
  relative(other: Date | IDateTime): string;

  /**
   * Add days to the date (returns new IDateTime)
   */
  addDays(days: number): IDateTime;

  /**
   * Add hours to the date (returns new IDateTime)
   */
  addHours(hours: number): IDateTime;

  /**
   * Add minutes to the date (returns new IDateTime)
   */
  addMinutes(minutes: number): IDateTime;

  /**
   * Add seconds to the date (returns new IDateTime)
   */
  addSeconds(seconds: number): IDateTime;

  /**
   * Add months to the date (returns new IDateTime)
   */
  addMonths(months: number): IDateTime;

  /**
   * Add years to the date (returns new IDateTime)
   */
  addYears(years: number): IDateTime;

  /**
   * Check if this date is before another date
   */
  isBefore(other: Date | IDateTime): boolean;

  /**
   * Check if this date is after another date
   */
  isAfter(other: Date | IDateTime): boolean;

  /**
   * Check if this date is the same as another date (ignoring time)
   */
  isSame(other: Date | IDateTime): boolean;

  /**
   * Check if this date is between two dates (inclusive)
   */
  isBetween(start: Date | IDateTime, end: Date | IDateTime): boolean;

  /**
   * Get difference in milliseconds from another date
   */
  diffMs(other: Date | IDateTime): number;

  /**
   * Get difference in seconds from another date
   */
  diffSeconds(other: Date | IDateTime): number;

  /**
   * Get difference in minutes from another date
   */
  diffMinutes(other: Date | IDateTime): number;

  /**
   * Get difference in hours from another date
   */
  diffHours(other: Date | IDateTime): number;

  /**
   * Get difference in days from another date
   */
  diffDays(other: Date | IDateTime): number;

  /**
   * Start of day (00:00:00)
   */
  startOfDay(): IDateTime;

  /**
   * End of day (23:59:59)
   */
  endOfDay(): IDateTime;

  /**
   * Start of month
   */
  startOfMonth(): IDateTime;

  /**
   * End of month
   */
  endOfMonth(): IDateTime;

  /**
   * Clone this datetime
   */
  clone(): IDateTime;

  /**
   * Get Unix timestamp (milliseconds since epoch)
   */
  getTime(): number;

  /**
   * Get year
   */
  getYear(): number;

  /**
   * Get month (0-11)
   */
  getMonth(): number;

  /**
   * Get day of month (1-31)
   */
  getDate(): number;

  /**
   * Get hours (0-23)
   */
  getHours(): number;

  /**
   * Get minutes (0-59)
   */
  getMinutes(): number;

  /**
   * Get seconds (0-59)
   */
  getSeconds(): number;

  /**
   * Get milliseconds (0-999)
   */
  getMilliseconds(): number;

  /**
   * Get day of week (0=Sunday, 6=Saturday)
   */
  getDayOfWeek(): number;

  /**
   * Get day of year (1-366)
   */
  getDayOfYear(): number;
}

/**
 * Create a DateTime instance from a Date or string
 */

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const monthNamesShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const padZero = (num: number, length: number = 2): string => {
  return String(num).padStart(length, '0');
};

const getDayOfYearHelper = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const calculateAgo = (value: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - value.getTime();

  if (diffMs < 1000) return 'just now';
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)} seconds ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} minutes ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hours ago`;
  if (diffMs < 604800000) return `${Math.floor(diffMs / 86400000)} days ago`;
  if (diffMs < 2592000000) return `${Math.floor(diffMs / 604800000)} weeks ago`;
  if (diffMs < 31536000000) return `${Math.floor(diffMs / 2592000000)} months ago`;
  return `${Math.floor(diffMs / 31536000000)} years ago`;
};

const formatRelativeTime = (diffMs: number, isFuture: boolean): string => {
  const unit = (count: number, label: string): string =>
    isFuture ? `in ${count} ${label}` : `${count} ${label} ago`;

  if (diffMs < 1000) return 'just now';
  if (diffMs < 60000) return unit(Math.floor(diffMs / 1000), 'seconds');
  if (diffMs < 3600000) return unit(Math.floor(diffMs / 60000), 'minutes');
  if (diffMs < 86400000) return unit(Math.floor(diffMs / 3600000), 'hours');
  if (diffMs < 604800000) return unit(Math.floor(diffMs / 86400000), 'days');
  if (diffMs < 2592000000) return unit(Math.floor(diffMs / 604800000), 'weeks');
  if (diffMs < 31536000000) return unit(Math.floor(diffMs / 2592000000), 'months');
  return unit(Math.floor(diffMs / 31536000000), 'years');
};

const calculateRelative = (value: Date, other: Date | IDateTime): string => {
  const otherDate = other instanceof Date ? other : other.toDate();
  const diffMs = otherDate.getTime() - value.getTime();

  if (diffMs < 0) {
    return formatRelativeTime(Math.abs(diffMs), false);
  }

  return formatRelativeTime(diffMs, true);
};

const createAddMethods = (
  value: Date
): {
  addDays: (days: number) => IDateTime;
  addHours: (hours: number) => IDateTime;
  addMinutes: (minutes: number) => IDateTime;
  addSeconds: (seconds: number) => IDateTime;
  addMonths: (months: number) => IDateTime;
  addYears: (years: number) => IDateTime;
} => {
  return {
    addDays: (days: number): IDateTime => {
      const newDate = new Date(value);
      newDate.setDate(newDate.getDate() + days);
      return createDateTime(newDate);
    },
    addHours: (hours: number): IDateTime => {
      const newDate = new Date(value);
      newDate.setHours(newDate.getHours() + hours);
      return createDateTime(newDate);
    },
    addMinutes: (minutes: number): IDateTime => {
      const newDate = new Date(value);
      newDate.setMinutes(newDate.getMinutes() + minutes);
      return createDateTime(newDate);
    },
    addSeconds: (seconds: number): IDateTime => {
      const newDate = new Date(value);
      newDate.setSeconds(newDate.getSeconds() + seconds);
      return createDateTime(newDate);
    },
    addMonths: (months: number): IDateTime => {
      const newDate = new Date(value);
      newDate.setMonth(newDate.getMonth() + months);
      return createDateTime(newDate);
    },
    addYears: (years: number): IDateTime => {
      const newDate = new Date(value);
      newDate.setFullYear(newDate.getFullYear() + years);
      return createDateTime(newDate);
    },
  };
};

const createCompareMethods = (
  value: Date
): {
  isBefore: (other: Date | IDateTime) => boolean;
  isAfter: (other: Date | IDateTime) => boolean;
  isSame: (other: Date | IDateTime) => boolean;
  isBetween: (start: Date | IDateTime, end: Date | IDateTime) => boolean;
} => {
  return {
    isBefore: (other: Date | IDateTime): boolean => {
      const otherDate = other instanceof Date ? other : other.toDate();
      return value.getTime() < otherDate.getTime();
    },
    isAfter: (other: Date | IDateTime): boolean => {
      const otherDate = other instanceof Date ? other : other.toDate();
      return value.getTime() > otherDate.getTime();
    },
    isSame: (other: Date | IDateTime): boolean => {
      const otherDate = other instanceof Date ? other : other.toDate();
      return (
        value.getFullYear() === otherDate.getFullYear() &&
        value.getMonth() === otherDate.getMonth() &&
        value.getDate() === otherDate.getDate()
      );
    },
    isBetween: (start: Date | IDateTime, end: Date | IDateTime): boolean => {
      const startDate = start instanceof Date ? start : start.toDate();
      const endDate = end instanceof Date ? end : end.toDate();
      return value.getTime() >= startDate.getTime() && value.getTime() <= endDate.getTime();
    },
  };
};

const createDiffMethods = (
  value: Date
): {
  diffMs: (other: Date | IDateTime) => number;
  diffSeconds: (other: Date | IDateTime) => number;
  diffMinutes: (other: Date | IDateTime) => number;
  diffHours: (other: Date | IDateTime) => number;
  diffDays: (other: Date | IDateTime) => number;
} => {
  const getOtherDate = (other: Date | IDateTime): Date =>
    other instanceof Date ? other : other.toDate();

  return {
    diffMs: (other: Date | IDateTime): number => {
      return value.getTime() - getOtherDate(other).getTime();
    },
    diffSeconds: (other: Date | IDateTime): number => {
      return Math.floor((value.getTime() - getOtherDate(other).getTime()) / 1000);
    },
    diffMinutes: (other: Date | IDateTime): number => {
      return Math.floor((value.getTime() - getOtherDate(other).getTime()) / 60000);
    },
    diffHours: (other: Date | IDateTime): number => {
      return Math.floor((value.getTime() - getOtherDate(other).getTime()) / 3600000);
    },
    diffDays: (other: Date | IDateTime): number => {
      return Math.floor((value.getTime() - getOtherDate(other).getTime()) / 86400000);
    },
  };
};

const createBoundaryMethods = (
  value: Date
): {
  startOfDay: () => IDateTime;
  endOfDay: () => IDateTime;
  startOfMonth: () => IDateTime;
  endOfMonth: () => IDateTime;
} => {
  return {
    startOfDay: (): IDateTime => {
      const newDate = new Date(value);
      newDate.setHours(0, 0, 0, 0);
      return createDateTime(newDate);
    },
    endOfDay: (): IDateTime => {
      const newDate = new Date(value);
      newDate.setHours(23, 59, 59, 999);
      return createDateTime(newDate);
    },
    startOfMonth: (): IDateTime => {
      const newDate = new Date(value);
      newDate.setDate(1);
      newDate.setHours(0, 0, 0, 0);
      return createDateTime(newDate);
    },
    endOfMonth: (): IDateTime => {
      const newDate = new Date(value);
      newDate.setMonth(newDate.getMonth() + 1);
      newDate.setDate(0);
      newDate.setHours(23, 59, 59, 999);
      return createDateTime(newDate);
    },
  };
};

const createDateTime = (date: Date): IDateTime => {
  // Create a copy to ensure immutability
  const value = new Date(date);

  const addMethods = createAddMethods(value);
  const compareMethods = createCompareMethods(value);
  const diffMethods = createDiffMethods(value);
  const boundaryMethods = createBoundaryMethods(value);

  return {
    toDate: () => new Date(value),

    format: (pattern: string): string => {
      let result = pattern;

      const year = value.getFullYear();
      const month = value.getMonth();
      const day = value.getDate();
      const hours = value.getHours();
      const minutes = value.getMinutes();
      const seconds = value.getSeconds();
      const milliseconds = value.getMilliseconds();

      // Replace tokens in the pattern
      result = result.replaceAll('YYYY', String(year));
      result = result.replaceAll('YY', String(year).slice(-2));
      result = result.replaceAll('MMMM', monthNames[month] ?? '');
      result = result.replaceAll('MMM', monthNamesShort[month] ?? '');
      result = result.replaceAll('MM', padZero(month + 1));
      result = result.replaceAll('M', String(month + 1));
      result = result.replaceAll('DD', padZero(day));
      result = result.replaceAll('D', String(day));
      result = result.replaceAll('HH', padZero(hours));
      result = result.replaceAll('H', String(hours));
      result = result.replaceAll('mm', padZero(minutes));
      result = result.replaceAll('m', String(minutes));
      result = result.replaceAll('ss', padZero(seconds));
      result = result.replaceAll('s', String(seconds));
      result = result.replaceAll('SSS', padZero(milliseconds, 3));
      result = result.replaceAll('S', String(milliseconds));

      return result;
    },

    toISO: (): string => value.toISOString(),
    toRFC3339: (): string => value.toISOString(),
    ago: (): string => calculateAgo(value),
    relative: (other: Date | IDateTime): string => calculateRelative(value, other),
    ...addMethods,
    ...compareMethods,
    ...diffMethods,
    ...boundaryMethods,
    clone: (): IDateTime => createDateTime(new Date(value)),
    getTime: (): number => value.getTime(),
    getYear: (): number => value.getFullYear(),
    getMonth: (): number => value.getMonth(),
    getDate: (): number => value.getDate(),
    getHours: (): number => value.getHours(),
    getMinutes: (): number => value.getMinutes(),
    getSeconds: (): number => value.getSeconds(),
    getMilliseconds: (): number => value.getMilliseconds(),
    getDayOfWeek: (): number => value.getDay(),
    getDayOfYear: (): number => getDayOfYearHelper(value),
  };
};

/**
 * Parse a date string into a DateTime object
 * Supports: ISO 8601, RFC 3339, common formats
 */
const parse = (dateString: string): IDateTime => {
  // Try to parse as ISO 8601 / RFC 3339
  const parsedDate = new Date(dateString);

  if (Number.isNaN(parsedDate.getTime())) {
    throw ErrorFactory.createValidationError(`Invalid date string: ${dateString}`);
  }

  return createDateTime(parsedDate);
};

/**
 * DateTime namespace - sealed namespace object grouping all DateTime operations
 * Immutable by design - all operations return new IDateTime instances
 */
export const DateTime = Object.freeze({
  /**
   * Create a DateTime from a Date object
   */
  create(date: Date = new Date()): IDateTime {
    return createDateTime(date);
  },

  /**
   * Get current DateTime
   */
  now(): IDateTime {
    return createDateTime(new Date());
  },

  /**
   * Parse a date string
   */
  parse(dateString: string): IDateTime {
    return parse(dateString);
  },

  /**
   * Create DateTime from timestamp (milliseconds since epoch)
   */
  fromTimestamp(timestamp: number): IDateTime {
    return createDateTime(new Date(timestamp));
  },

  /**
   * Create DateTime from components
   */
  fromComponents(
    year: number,
    month: number,
    day: number = 1,
    hours: number = 0,
    minutes: number = 0,
    seconds: number = 0
  ): IDateTime {
    return createDateTime(new Date(year, month - 1, day, hours, minutes, seconds));
  },
});
