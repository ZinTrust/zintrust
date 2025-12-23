/**
 * Service Health Check and Monitoring System
 * Provides per-service and aggregated health status with detailed diagnostics
 */

import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { validateUrl } from '@security/UrlValidator';

export interface HealthCheckResult {
  service: string;
  domain: string;
  port: number;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'stopped';
  timestamp: string;
  responseTime: number; // milliseconds
  version: string;
  checks: {
    http: boolean;
    database?: boolean;
    dependencies?: Record<string, boolean>; // status of dependent services
  };
  message?: string;
}

export interface AggregatedHealthStatus {
  timestamp: string;
  totalServices: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  services: HealthCheckResult[];
}

export interface IHealthCheckHandler {
  handle(req: IRequest, res: IResponse): Promise<void>;
}

/**
 * Health Check Endpoint Handler
 * Each service should expose this as GET /health
 */
export const HealthCheckHandler = Object.freeze({
  /**
   * Create a new health check handler instance
   */
  create(
    serviceName: string,
    version: string,
    port: number,
    domain: string,
    dependencies: string[] = [],
    checkDatabase?: () => Promise<boolean>
  ): IHealthCheckHandler {
    /**
     * Perform full health check
     */
    const performHealthCheck = async (startTime: number): Promise<HealthCheckResult> => {
      const result: HealthCheckResult = {
        service: serviceName,
        domain,
        port,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime: 0,
        version,
        checks: {
          http: true,
          database: undefined,
          dependencies: {},
        },
      };

      await checkDatabaseHealth(result, checkDatabase);
      await checkDependenciesHealth(result, dependencies);

      result.responseTime = Date.now() - startTime;
      return result;
    };

    return {
      /**
       * Handle health check request
       * Returns JSON with service health status
       */
      async handle(_req: IRequest, res: IResponse): Promise<void> {
        const startTime = Date.now();

        try {
          const result = await performHealthCheck(startTime);
          const statusCode = getStatusCode(result.status);
          res.setStatus(statusCode).json(result);
        } catch (err) {
          Logger.error('Health check handler error:', err);
          const result: HealthCheckResult = {
            service: serviceName,
            domain,
            port,
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            responseTime: Date.now() - startTime,
            version,
            checks: { http: false },
            message: (err as Error).message,
          };

          res.setStatus(503).json(result);
        }
      },
    };
  },
});

/**
 * Get status code based on health status
 */
function getStatusCode(status: string): number {
  if (status === 'healthy') return 200;
  if (status === 'degraded') return 202;
  return 503;
}

/**
 * Check single dependency service
 */
async function checkDependencyService(depService: string): Promise<boolean> {
  try {
    // In a real environment, we would resolve the service URL
    // For now, we assume it's on localhost with a standard port mapping or discovery
    const url = `http://localhost:3000/health?service=${depService}`;

    // SSRF Protection
    validateUrl(url);

    const depResponse = await fetch(url, {
      signal: AbortSignal.timeout(2000),
    });
    return depResponse.ok;
  } catch (error) {
    Logger.error(`Dependency health check failed for ${depService}`, error);
    return false;
  }
}

/**
 * Check all dependencies health
 */
async function checkDependenciesHealth(
  result: HealthCheckResult,
  dependencies: string[]
): Promise<void> {
  if (dependencies.length === 0) return;

  result.checks.dependencies ??= {};

  for (const depService of dependencies) {
    const isHealthy = await checkDependencyService(depService);
    result.checks.dependencies[depService] = isHealthy;
    if (!isHealthy) {
      result.status = 'degraded';
    }
  }
}

/**
 * Check database health
 */
async function checkDatabaseHealth(
  result: HealthCheckResult,
  checkDatabase?: () => Promise<boolean>
): Promise<void> {
  if (checkDatabase === undefined) return;

  try {
    result.checks.database = await checkDatabase();
    if (!result.checks.database) {
      result.status = 'degraded';
      result.message = 'Database connection failed';
    }
  } catch (err) {
    Logger.error('Database health check failed:', err);
    result.checks.database = false;
    result.status = 'unhealthy';
    result.message = 'Database check error';
  }
}

export interface IServiceHealthMonitor {
  start(): void;
  stop(): void;
  checkAll(): Promise<AggregatedHealthStatus>;
  getLastStatus(): AggregatedHealthStatus;
  getServiceStatus(serviceName: string): HealthCheckResult | undefined;
  areAllHealthy(): boolean;
  isServiceHealthy(serviceName: string): boolean;
}

/**
 * Service Health Monitor
 * Monitors multiple services and provides aggregated health status
 */
export const ServiceHealthMonitor = Object.freeze({
  /**
   * Create a new service health monitor instance
   */
  create(
    healthCheckUrls: Record<string, string>, // serviceName -> healthCheckUrl
    intervalMs: number = 30000 // Check every 30 seconds
  ): IServiceHealthMonitor {
    let checkIntervalId: NodeJS.Timeout | undefined;
    const lastResults: Map<string, HealthCheckResult> = new Map();

    return createMonitorObject(
      healthCheckUrls,
      intervalMs,
      lastResults,
      () => checkIntervalId,
      (id) => {
        checkIntervalId = id;
      }
    );
  },
});

/**
 * Create the monitor object with methods
 */
function createMonitorObject(
  healthCheckUrls: Record<string, string>,
  intervalMs: number,
  lastResults: Map<string, HealthCheckResult>,
  getIntervalId: () => NodeJS.Timeout | undefined,
  setIntervalId: (id: NodeJS.Timeout | undefined) => void
): IServiceHealthMonitor {
  const self: IServiceHealthMonitor = {
    /**
     * Start continuous health monitoring
     */
    start(): void {
      startMonitoring(intervalMs, () => self.checkAll(), getIntervalId, setIntervalId);
    },

    /**
     * Stop health monitoring
     */
    stop(): void {
      stopMonitoring(getIntervalId, setIntervalId);
    },

    /**
     * Check all services
     */
    async checkAll(): Promise<AggregatedHealthStatus> {
      const status = await runAllChecks(healthCheckUrls, lastResults);
      logHealthSummary(status);

      return status;
    },

    /**
     * Get last known status of all services
     */
    getLastStatus(): AggregatedHealthStatus {
      const results = Array.from(lastResults.values());
      return calculateAggregatedStatus(results);
    },

    /**
     * Get health status for specific service
     */
    getServiceStatus(serviceName: string): HealthCheckResult | undefined {
      return lastResults.get(serviceName);
    },

    /**
     * Check if all services are healthy
     */
    areAllHealthy(): boolean {
      return checkAllHealthy(lastResults, healthCheckUrls);
    },

    /**
     * Check if service is healthy
     */
    isServiceHealthy(serviceName: string): boolean {
      const status = self.getServiceStatus(serviceName);
      return status?.status === 'healthy';
    },
  };

  return self;
}

/**
 * Start monitoring logic
 */
function startMonitoring(
  intervalMs: number,
  checkAll: () => Promise<AggregatedHealthStatus>,
  getIntervalId: () => NodeJS.Timeout | undefined,
  setIntervalId: (id: NodeJS.Timeout | undefined) => void
): void {
  if (getIntervalId() !== undefined) {
    Logger.warn('Health monitoring already started');
    return;
  }

  Logger.info('🏥 Starting service health monitoring');
  checkAll(); // Initial check

  const id = setInterval(() => {
    checkAll();
  }, intervalMs);
  setIntervalId(id);
}

/**
 * Stop monitoring logic
 */
function stopMonitoring(
  getIntervalId: () => NodeJS.Timeout | undefined,
  setIntervalId: (id: NodeJS.Timeout | undefined) => void
): void {
  const id = getIntervalId();
  if (id !== undefined) {
    clearInterval(id);
    setIntervalId(undefined);
    Logger.info('🛑 Health monitoring stopped');
  }
}

/**
 * Check if all services are healthy
 */
function checkAllHealthy(
  lastResults: Map<string, HealthCheckResult>,
  healthCheckUrls: Record<string, string>
): boolean {
  const results = Array.from(lastResults.values());
  if (results.length === 0 && Object.keys(healthCheckUrls).length > 0) {
    return false;
  }
  return results.length > 0 && results.every((r) => r.status === 'healthy');
}

/**
 * Check single service
 */
async function checkService(serviceName: string, url: string): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    await response.json();

    return {
      service: serviceName,
      domain: 'unknown',
      port: 0,
      status: 'healthy' as const,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      version: 'unknown',
      checks: { http: true },
    } as HealthCheckResult;
  } catch (err) {
    Logger.error(`Service health check failed for ${serviceName}:`, err);
    return {
      service: serviceName,
      domain: 'unknown',
      port: 0,
      status: 'stopped',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      version: 'unknown',
      checks: { http: false },
      message: `Service check failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Calculate aggregated health status from results
 */
function calculateAggregatedStatus(results: HealthCheckResult[]): AggregatedHealthStatus {
  const healthy = results.filter((r) => r.status === 'healthy').length;
  const degraded = results.filter((r) => r.status === 'degraded').length;
  const unhealthy = results.filter((r) => r.status === 'unhealthy').length;

  return {
    timestamp: new Date().toISOString(),
    totalServices: results.length,
    healthy,
    degraded,
    unhealthy,
    services: results,
  };
}

/**
 * Log health summary
 */
function logHealthSummary(status: AggregatedHealthStatus): void {
  if (status.unhealthy > 0) {
    Logger.warn(
      `⚠️  Health check: ${status.healthy} healthy, ${status.degraded} degraded, ${status.unhealthy} unhealthy`
    );
  } else if (status.degraded > 0) {
    Logger.warn(`⚠️  Health check: ${status.healthy} healthy, ${status.degraded} degraded`);
  } else {
    Logger.info(`✅ All ${status.healthy} services healthy`);
  }
}

export interface IHealthCheckAggregator {
  handle(req: IRequest, res: IResponse): Promise<void>;
}

/**
 * Health Check Aggregator Endpoint
 * Exposes aggregated health status at GET /health/services
 */
export const HealthCheckAggregator = Object.freeze({
  /**
   * Create a new health check aggregator instance
   */
  create(monitor: IServiceHealthMonitor): IHealthCheckAggregator {
    return {
      /**
       * Handle aggregated health check request
       */
      async handle(_req: IRequest, res: IResponse): Promise<void> {
        const status = monitor.getLastStatus();

        let statusCode: number;
        if (status.unhealthy > 0) {
          statusCode = 503;
        } else if (status.degraded > 0) {
          statusCode = 202;
        } else {
          statusCode = 200;
        }

        res.setStatus(statusCode).json(status);
      },
    };
  },
});

/**
 * Run all service health checks
 */
async function runAllChecks(
  healthCheckUrls: Record<string, string>,
  lastResults: Map<string, HealthCheckResult>
): Promise<AggregatedHealthStatus> {
  const checks = Object.entries(healthCheckUrls).map(([serviceName, url]) =>
    checkService(serviceName, url)
  );

  const results = await Promise.all(checks);

  // Store results
  results.forEach((result) => {
    lastResults.set(result.service, result);
  });

  return calculateAggregatedStatus(results);
}

export default {
  HealthCheckHandler,
  ServiceHealthMonitor,
  HealthCheckAggregator,
};
