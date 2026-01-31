import { Logger } from '@zintrust/core';
import type { WorkerData } from '../../dashboard';
import { getWorkers } from '../../dashboard/workers-api';
import { HealthMonitor } from '../../HealthMonitor';
import type { WorkerResourceUsage } from '../../ResourceMonitor';
import { ResourceMonitor } from '../../ResourceMonitor';

export type TelemetrySettings = {
  enabled: boolean;
  basePath: string;
  middleware: ReadonlyArray<string>;
  autoRefresh: boolean;
  refreshIntervalMs: number;
};

export type ResourceCurrentResponse = { ok: boolean; usage?: unknown };
export type SystemSummaryResponse = { ok: boolean; summary?: unknown };

const isOkWithUsage = (value: ResourceCurrentResponse): value is ResourceCurrentResponse =>
  value.ok === true && 'usage' in value;

const isOkWithSummary = (value: SystemSummaryResponse): value is SystemSummaryResponse =>
  value.ok === true && 'summary' in value;

export type ApiResponse<T> = { ok: boolean; error?: string } & T;
export type AlertRep = {
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  recommendation?: string;
};
// Helper function to create stopped worker alert
const createStoppedWorkerAlert = (worker: WorkerData): AlertRep => ({
  type: 'worker-stopped',
  severity: 'warning',
  message: `Worker ${worker.name} is stopped`,
  timestamp: worker.health?.lastCheck || new Date().toISOString(),
});

// Helper function to create health check alert
const createHealthCheckAlert = (worker: WorkerData): AlertRep | null => {
  const check = worker.health?.checks?.[0];
  if (!check) return null;

  return {
    type: 'health-check-failed',
    severity: check.status === 'fail' ? 'critical' : 'warning',
    message: check.message || `Health check failed: ${check.name}`,
    timestamp: worker.health?.lastCheck || new Date().toISOString(),
  };
};

// Helper function to generate worker alerts
const generateWorkerAlerts = (
  workers: WorkerData[]
): {
  workerName: string;
  status: string;
  healthStatus: string;
  lastCheck: string;
  checks: WorkerData['health']['checks'];
  alert: AlertRep | null;
}[] => {
  return workers
    .filter((w) => {
      return (
        w.status !== 'running' ||
        w.health?.status !== 'healthy' ||
        (w.health?.checks && w.health.checks.length > 0)
      );
    })
    .map((w) => {
      const workerData = {
        workerName: w.name,
        status: w.status,
        healthStatus: w.health?.status || 'unknown',
        lastCheck: w.health?.lastCheck || new Date().toISOString(),
        checks: w.health?.checks || [],
      };

      let alert = null;
      if (w.status === 'stopped') {
        alert = createStoppedWorkerAlert(w);
      } else if (w.health?.checks && w.health.checks.length > 0) {
        alert = createHealthCheckAlert(w);
      }

      return {
        ...workerData,
        alert,
      };
    })
    .filter((w) => w.alert !== null);
};

// Helper function to generate resource alerts
const generateResourceAlerts = (resourceUsage: WorkerResourceUsage): AlertRep[] => {
  const resourceAlerts = [];
  const cpuUsage = resourceUsage.resourceSnapshot?.cpu?.usage || 0;
  const memoryUsage = resourceUsage.resourceSnapshot?.memory?.usage || 0;

  if (cpuUsage > 90) {
    resourceAlerts.push({
      type: 'cpu-high',
      severity: 'critical',
      message: `Critical CPU usage: ${cpuUsage.toFixed(1)}%`,
      timestamp: new Date().toISOString(),
      recommendation: 'Consider scaling up or optimizing worker code',
    });
  } else if (cpuUsage > 80) {
    resourceAlerts.push({
      type: 'cpu-high',
      severity: 'warning',
      message: `High CPU usage: ${cpuUsage.toFixed(1)}%`,
      timestamp: new Date().toISOString(),
      recommendation: 'Monitor closely and consider scaling',
    });
  }

  if (memoryUsage > 95) {
    resourceAlerts.push({
      type: 'memory-high',
      severity: 'critical',
      message: `Critical memory usage: ${memoryUsage.toFixed(1)}%`,
      timestamp: new Date().toISOString(),
      recommendation: 'Increase memory allocation or optimize memory usage',
    });
  } else if (memoryUsage > 85) {
    resourceAlerts.push({
      type: 'memory-high',
      severity: 'warning',
      message: `High memory usage: ${memoryUsage.toFixed(1)}%`,
      timestamp: new Date().toISOString(),
      recommendation: 'Monitor memory usage closely',
    });
  }

  return resourceAlerts;
};

// Helper function to calculate monitoring summary
const calculateMonitoringSummary = (
  runningWorkers: WorkerData[]
): {
  total: number;
  healthy: number;
  degraded: number;
  critical: number;
  details: {
    workerName: string;
    status: string;
    lastCheck: string;
    checks: WorkerData['health']['checks'];
  }[];
} => {
  const healthyCount = runningWorkers.filter((w) => w.health?.status === 'healthy').length;
  const degradedCount = runningWorkers.filter((w) => w.health?.status === 'warning').length;
  const criticalCount = runningWorkers.filter((w) => w.health?.status === 'unhealthy').length;

  return {
    total: runningWorkers.length,
    healthy: healthyCount,
    degraded: degradedCount,
    critical: criticalCount,
    details: runningWorkers.map((w) => ({
      workerName: w.name,
      status: w.health?.status || 'unknown',
      lastCheck: w.health?.lastCheck || new Date().toISOString(),
      checks: w.health?.checks || [],
    })),
  };
};

export const TelemetryAPI = Object.freeze({
  async getSystemSummary(): Promise<ApiResponse<{ summary: unknown }>> {
    try {
      // Get all workers (both running and stopped) for complete alert visibility
      const workersResult = await getWorkers({});
      const runningWorkers = workersResult.workers.filter((w) => w.status === 'running');

      // Calculate monitoring summary from running workers only
      const monitoringSummary = calculateMonitoringSummary(runningWorkers);

      // Generate alerts from workers and resources
      const workerAlerts = generateWorkerAlerts(workersResult.workers);
      const resourceUsage = ResourceMonitor.getCurrentUsage('system');
      const resourceAlerts = generateResourceAlerts(resourceUsage);

      // Combine all alerts
      const allAlerts = [...workerAlerts, ...resourceAlerts];

      return {
        ok: true,
        summary: {
          workers: runningWorkers.length,
          monitoring: {
            ...monitoringSummary,
            alerts: allAlerts, // Include all alerts (workers + resources)
          },
          resources: resourceUsage,
          alerts: allAlerts, // Top-level alerts for easy access
        },
      };
    } catch (error) {
      Logger.error('Failed to get system summary', error as Error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        summary: {},
      };
    }
  },

  async getMonitoringSummary(): Promise<ApiResponse<{ summary: unknown }>> {
    try {
      const summary = await HealthMonitor.getSummary();
      return { ok: true, summary };
    } catch (error) {
      Logger.error('Failed to get monitoring summary', error as Error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        summary: {},
      };
    }
  },

  async getResourceCurrent(): Promise<ApiResponse<{ usage: unknown }>> {
    try {
      const usage = ResourceMonitor.getCurrentUsage('system');
      return { ok: true, usage };
    } catch (error) {
      Logger.error('Failed to get resource usage', error as Error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        usage: null,
      };
    }
  },

  async getResourceTrends(): Promise<ApiResponse<{ trends: unknown }>> {
    try {
      const trends = ResourceMonitor.getAllTrends('system', 'day');
      return { ok: true, trends };
    } catch (error) {
      Logger.error('Failed to get resource trends', error as Error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        trends: null,
      };
    }
  },
});

export function createSnapshotBuilder() {
  return async (): Promise<{
    ok: boolean;
    summary: unknown;
    resources: unknown;
    cost: unknown;
  }> => {
    const [systemSummaryResult, resourceCurrentResult] = await Promise.allSettled([
      TelemetryAPI.getSystemSummary(),
      TelemetryAPI.getResourceCurrent(),
    ]);

    if (systemSummaryResult.status === 'rejected') {
      Logger.error('Telemetry dashboard summary failed', systemSummaryResult.reason);
    }

    if (resourceCurrentResult.status === 'rejected') {
      Logger.error('Telemetry resource summary failed', resourceCurrentResult.reason);
    }

    const systemSummary: SystemSummaryResponse =
      systemSummaryResult.status === 'fulfilled' ? systemSummaryResult.value : { ok: false };
    const resourceCurrent =
      resourceCurrentResult.status === 'fulfilled'
        ? resourceCurrentResult.value
        : ({ ok: false } as ResourceCurrentResponse);

    return {
      ok: systemSummary.ok ?? false,
      summary: isOkWithSummary(systemSummary) ? systemSummary.summary : {},
      resources: isOkWithUsage(resourceCurrent) ? resourceCurrent.usage : null,
      cost: null,
    };
  };
}
