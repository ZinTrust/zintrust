declare module '@zintrust/queue-monitor' {
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
  };

  export type QueueMonitorApi = {
    registerRoutes: (router: import('@zintrust/core').IRouter) => void;
    getSnapshot: () => Promise<QueueMonitorSnapshot>;
  };

  export const QueueMonitor: Readonly<{
    create: (config: QueueMonitorConfig) => QueueMonitorApi;
  }>;

  export default QueueMonitor;
}
