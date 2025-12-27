/**
 * Scheduler types
 */

export type IScheduleKernel = Readonly<{
  getContainer?: () => unknown;
  getRouter?: () => unknown;
}>;

export type IScheduleHandler = (kernel?: IScheduleKernel) => Promise<void> | void;

export type ISchedule = {
  name: string;
  intervalMs?: number; // interval in milliseconds; if absent, schedule won't be auto-registered for intervals
  handler: IScheduleHandler;
  enabled?: boolean;
  runOnStart?: boolean;
};
