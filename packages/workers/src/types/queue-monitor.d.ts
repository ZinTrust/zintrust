declare module '@zintrust/queue-monitor' {
  export type JobStatus = 'completed' | 'failed';

  export type JobSummary = {
    id: string | undefined;
    name: string;
    queue?: string;
    data: unknown;
    attempts: number;
    status?: string;
    failedReason?: string;
    timestamp: number;
    processedOn?: number;
    finishedOn?: number;
  };

  export type Metrics = {
    recordJob: (
      queue: string,
      status: JobStatus,
      job: {
        id?: string;
        name?: string;
        data?: unknown;
        attemptsMade?: number;
        failedReason?: string;
        processedOn?: number;
        finishedOn?: number;
      },
      error?: Error
    ) => Promise<void>;
    getStats: (
      queue: string,
      minutes?: number
    ) => Promise<Array<{ time: string; completed: number; failed: number }>>;
    getRecentJobs: (queue: string) => Promise<JobSummary[]>;
    getFailedJobs: (queue: string) => Promise<JobSummary[]>;
    close: () => Promise<void>;
  };

  export type QueueCounts = {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };

  export type QueueMonitorSnapshot = {
    status: 'ok';
    startedAt: string;
    queues: Array<{
      name: string;
      counts: QueueCounts;
    }>;
  };

  export type QueueMonitorConfig = {
    enabled?: boolean;
    basePath?: string;
    middleware?: ReadonlyArray<string>;
    autoRefresh?: boolean;
    refreshIntervalMs?: number;
    redis?: Record<string, unknown>;
    knownQueues?:
      | ReadonlyArray<string>
      | (() => Promise<ReadonlyArray<string>> | ReadonlyArray<string>);
  };

  export type QueueMonitorApi = {
    registerRoutes: (router: import('@zintrust/core').IRouter) => void;
    getSnapshot: () => Promise<QueueMonitorSnapshot>;
  };

  export const createMetrics: (config: {
    host: string;
    port: number;
    password?: string;
    db: number;
  }) => Metrics;

  export const QueueMonitor: Readonly<{
    create: (config: QueueMonitorConfig) => QueueMonitorApi;
  }>;

  export default QueueMonitor;
}
