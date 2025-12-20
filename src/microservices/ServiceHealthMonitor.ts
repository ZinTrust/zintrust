/**
 * Service Health Check and Monitoring System
 * Provides per-service and aggregated health status with detailed diagnostics
 */

import { Logger } from '@config/logger';
import { Request } from '@http/Request';
import { Response } from '@http/Response';

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

/**
 * Health Check Endpoint Handler
 * Each service should expose this as GET /health
 */
export class HealthCheckHandler {
  constructor(
    private readonly serviceName: string,
    private readonly version: string,
    private readonly port: number,
    private readonly domain: string,
    private readonly dependencies: string[] = [],
    private readonly checkDatabase?: () => Promise<boolean>
  ) {}

  /**
   * Handle health check request
   * Returns JSON with service health status
   */
  async handle(_req: Request, res: Response): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await this.performHealthCheck(startTime);
      const statusCode = this.getStatusCode(result.status);
      res.setStatus(statusCode).json(result);
    } catch (err) {
      Logger.error('Health check handler error:', err);
      const result: HealthCheckResult = {
        service: this.serviceName,
        domain: this.domain,
        port: this.port,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        version: this.version,
        checks: { http: false },
        message: (err as Error).message,
      };

      res.setStatus(503).json(result);
    }
  }

  private async performHealthCheck(startTime: number): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      service: this.serviceName,
      domain: this.domain,
      port: this.port,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime: 0,
      version: this.version,
      checks: {
        http: true,
        database: undefined,
        dependencies: {},
      },
    };

    await this.checkDatabaseHealth(result);
    await this.checkDependenciesHealth(result);

    result.responseTime = Date.now() - startTime;
    return result;
  }

  private async checkDatabaseHealth(result: HealthCheckResult): Promise<void> {
    if (this.checkDatabase === undefined) return;

    try {
      result.checks.database = await this.checkDatabase();
      if (result.checks.database === false) {
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

  private async checkDependenciesHealth(result: HealthCheckResult): Promise<void> {
    if (this.dependencies.length === 0) return;

    result.checks.dependencies ??= {};

    for (const depService of this.dependencies) {
      const isHealthy = await this.checkDependencyService(depService);
      result.checks.dependencies[depService] = isHealthy;
      if (isHealthy === false) {
        result.status = 'degraded';
      }
    }
  }

  private async checkDependencyService(_depService: string): Promise<boolean> {
    try {
      const depResponse = await fetch(`http://localhost:3000/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return depResponse.ok;
    } catch (error) {
      Logger.error('Dependency health check failed', error);
      return false;
    }
  }

  private getStatusCode(status: string): number {
    if (status === 'healthy') return 200;
    if (status === 'degraded') return 202;
    return 503;
  }
}

/**
 * Service Health Monitor
 * Monitors multiple services and provides aggregated health status
 */
export class ServiceHealthMonitor {
  private checkIntervalId?: NodeJS.Timeout;
  private readonly lastResults: Map<string, HealthCheckResult> = new Map();

  constructor(
    private readonly healthCheckUrls: Record<string, string>, // serviceName -> healthCheckUrl
    private readonly intervalMs: number = 30000 // Check every 30 seconds
  ) {}

  /**
   * Start continuous health monitoring
   */
  public start(): void {
    if (this.checkIntervalId !== undefined) {
      Logger.warn('Health monitoring already started');
      return;
    }

    Logger.info('🏥 Starting service health monitoring');
    this.checkAll(); // Initial check

    this.checkIntervalId = setInterval(() => {
      this.checkAll();
    }, this.intervalMs);
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    if (this.checkIntervalId !== undefined) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = undefined;
      Logger.info('🛑 Health monitoring stopped');
    }
  }

  /**
   * Check all services
   */
  public async checkAll(): Promise<AggregatedHealthStatus> {
    const checks = Object.entries(this.healthCheckUrls).map(([serviceName, url]) =>
      this.checkService(serviceName, url)
    );

    const results = await Promise.all(checks);

    // Store results
    results.forEach((result) => {
      this.lastResults.set(result.service, result);
    });

    // Log summary
    const healthy = results.filter((r) => r.status === 'healthy').length;
    const degraded = results.filter((r) => r.status === 'degraded').length;
    const unhealthy = results.filter((r) => r.status === 'unhealthy').length;

    if (unhealthy > 0) {
      Logger.warn(
        `⚠️  Health check: ${healthy} healthy, ${degraded} degraded, ${unhealthy} unhealthy`
      );
    } else if (degraded > 0) {
      Logger.warn(`⚠️  Health check: ${healthy} healthy, ${degraded} degraded`);
    } else {
      Logger.info(`✅ All ${healthy} services healthy`);
    }

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
   * Get last known status of all services
   */
  public getLastStatus(): AggregatedHealthStatus {
    const results = Array.from(this.lastResults.values());

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
   * Check single service
   */
  private async checkService(serviceName: string, url: string): Promise<HealthCheckResult> {
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
   * Get health status for specific service
   */
  public getServiceStatus(serviceName: string): HealthCheckResult | undefined {
    return this.lastResults.get(serviceName);
  }

  /**
   * Check if all services are healthy
   */
  public areAllHealthy(): boolean {
    const results = Array.from(this.lastResults.values());
    if (results.length === 0 && Object.keys(this.healthCheckUrls).length > 0) {
      return false;
    }
    return results.length > 0 && results.every((r) => r.status === 'healthy');
  }

  /**
   * Check if service is healthy
   */
  public isServiceHealthy(serviceName: string): boolean {
    const status = this.getServiceStatus(serviceName);
    return status?.status === 'healthy';
  }
}

/**
 * Health Check Aggregator Endpoint
 * Exposes aggregated health status at GET /health/services
 */
export class HealthCheckAggregator {
  constructor(private readonly monitor: ServiceHealthMonitor) {}

  /**
   * Handle aggregated health check request
   */
  async handle(_req: Request, res: Response): Promise<void> {
    const status = this.monitor.getLastStatus();

    let statusCode: number;
    if (status.unhealthy > 0) {
      statusCode = 503;
    } else if (status.degraded > 0) {
      statusCode = 202;
    } else {
      statusCode = 200;
    }

    res.setStatus(statusCode).json(status);
  }
}

export default {
  HealthCheckHandler,
  ServiceHealthMonitor,
  HealthCheckAggregator,
};
