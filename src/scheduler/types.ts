/**
 * Scheduler types
 */

export type IScheduleKernel = Readonly<{
  getContainer?: () => unknown;
  getRouter?: () => unknown;
}>;

export type IScheduleHandler = (kernel?: IScheduleKernel) => Promise<void> | void;

export type IScheduleBackoffPolicy = Readonly<{
  initialMs: number;
  maxMs: number;
  factor?: number;
}>;

export type ISchedule = {
  name: string;
  intervalMs?: number; // interval in milliseconds; if absent, schedule won't be auto-registered for intervals
  cron?: string;
  timezone?: string;
  jitterMs?: number;
  backoff?: IScheduleBackoffPolicy;
  leaderOnly?: boolean;
  handler: IScheduleHandler;
  enabled?: boolean;
  runOnStart?: boolean;
};
