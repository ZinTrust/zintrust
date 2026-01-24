// Worker Configuration Types
export interface WorkerConfiguration {
  [key: string]: string | number | boolean | null | undefined | object;
}

export type WorkerDriver = 'db' | 'redis' | 'memory';

export type WorkerStatus = 'running' | 'stopped' | 'error' | 'paused';

export type WorkerSortBy = 'name' | 'status' | 'driver' | 'health' | 'version' | 'processed';

export type WorkerSortOrder = 'asc' | 'desc';

export type WorkerHealthStatus = 'healthy' | 'unhealthy' | 'warning';

export type WorkerHealthCheckStatus = 'pass' | 'fail' | 'warn';

// Worker Health Types
export interface WorkerHealth {
  status: WorkerHealthStatus;
  checks: Array<{
    name: string;
    status: WorkerHealthCheckStatus;
    message?: string;
  }>;
  lastCheck: string;
}

// Worker Metrics Types
export interface WorkerMetrics {
  processed: number;
  failed: number;
  avgTime: number;
  memory: number;
  cpu: number;
  uptime: number;
  [key: string]: string | number | boolean | null | undefined;
}

// Worker Data Types
export interface WorkerData {
  name: string;
  queueName: string;
  status: WorkerStatus;
  health: WorkerHealth;
  driver: WorkerDriver;
  version: string;
  processed: number;
  avgTime: number;
  memory: number;
  autoStart: boolean;
  details?: {
    configuration: WorkerConfiguration;
    health: WorkerHealth;
    metrics: WorkerMetrics;
    recentLogs: Array<{
      timestamp: string;
      level: string;
      message: string;
    }>;
  };
}

// Workers List Response Types
export interface WorkersListResponse {
  workers: WorkerData[];
  queueData: QueueData;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  drivers: WorkerDriver[];
}

// Queue Data Types
export interface QueueData {
  driver: WorkerDriver;
  totalQueues: number;
  totalJobs: number;
  processingJobs: number;
  failedJobs: number;
}

// API Query Types
export type GetWorkersQuery = {
  page?: number;
  limit?: number;
  sortBy?: WorkerSortBy;
  sortOrder?: WorkerSortOrder;
  status?: WorkerStatus;
  driver?: WorkerDriver;
  search?: string;
  includeDetails?: boolean;
};

// UI Options Types
export type WorkersDashboardUiOptions = {
  autoRefresh: boolean;
  refreshIntervalMs: number;
  pageSize: number;
  enableAutoStart: boolean;
  basePath?: string;
};

// Internal Types (not exported)
export type RawWorkerData = {
  name: string;
  status?: WorkerStatus;
  lastError?: string;
  avgTime?: number;
  memory?: number;
  processed?: number;
  version?: string;
  autoStart?: boolean;
  queueName?: string;
  details?: {
    configuration: WorkerConfiguration;
    health: WorkerHealth;
    metrics: WorkerMetrics;
    recentLogs: Array<{
      timestamp: string;
      level: string;
      message: string;
    }>;
  };
};

export type WorkerDetails = {
  configuration: WorkerConfiguration;
  health: WorkerHealth;
  metrics: WorkerMetrics;
  recentLogs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
};
