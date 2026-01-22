/**
 * Worker Management Routes
 * HTTP API for managing workers with all enterprise features
 */

import { Logger, Router, type IRouter } from '@zintrust/core';
import { WorkerController } from '../http/WorkerController';

const controller = WorkerController.create();

function registerWorkerLifecycleRoutes(router: IRouter): void {
  Router.group(router, '/api/workers', (r: IRouter) => {
    // Core worker operations
    Logger.info('Registering Worker Management Routes');

    Router.post(r, '/create', controller.create);
    Router.post(r, '/:name/start', controller.start);
    Router.post(r, '/:name/auto-start', controller.setAutoStart);
    Router.post(r, '/:name/stop', controller.stop);
    Router.post(r, '/:name/restart', controller.restart);
    Router.post(r, '/:name/pause', controller.pause);
    Router.post(r, '/:name/resume', controller.resume);
    Router.del(r, '/:name', controller.remove);

    // Worker information
    Router.get(r, '/', controller.list);
    Router.get(r, '/:name', controller.get);
    Router.get(r, '/:name/status', controller.status);
    Router.get(r, '/:name/metrics', controller.metrics);
    Router.get(r, '/:name/health', controller.health);

    // Health monitoring
    Router.post(r, '/:name/monitoring/start', controller.startMonitoring);
    Router.post(r, '/:name/monitoring/stop', controller.stopMonitoring);
    Router.get(r, '/:name/monitoring/history', controller.healthHistory);
    Router.get(r, '/:name/monitoring/trend', controller.healthTrend);
    Router.put(r, '/:name/monitoring/config', controller.updateMonitoringConfig);

    // Versioning
    Router.post(r, '/:name/versions', controller.registerVersion);
    Router.get(r, '/:name/versions', controller.listVersions);
    Router.get(r, '/:name/versions/:version', controller.getVersion);
    Router.post(r, '/:name/versions/:version/deprecate', controller.deprecateVersion);
    Router.post(r, '/:name/versions/:version/activate', controller.activateVersion);
    Router.post(r, '/:name/versions/:version/deactivate', controller.deactivateVersion);
    Router.post(r, '/:name/versions/compatibility', controller.checkCompatibility);

    // Canary deployments
    Router.post(r, '/:name/canary/start', controller.startCanary);
    Router.post(r, '/:name/canary/pause', controller.pauseCanary);
    Router.post(r, '/:name/canary/resume', controller.resumeCanary);
    Router.post(r, '/:name/canary/rollback', controller.rollbackCanary);
    Router.get(r, '/:name/canary/status', controller.canaryStatus);
    Router.get(r, '/:name/canary/history', controller.canaryHistory);

    // Circuit breaker
    Router.get(r, '/:name/circuit-breaker', controller.circuitBreakerState);
    Router.post(r, '/:name/circuit-breaker/reset', controller.resetCircuitBreaker);
    Router.post(r, '/:name/circuit-breaker/force-open', controller.forceOpenCircuit);
    Router.get(r, '/:name/circuit-breaker/events', controller.circuitBreakerEvents);

    // Dead letter queue
    Router.get(r, '/:name/dead-letter-queue', controller.listFailedJobs);
    Router.get(r, '/:name/dead-letter-queue/:jobId', controller.getFailedJob);
    Router.post(r, '/:name/dead-letter-queue/:jobId/retry', controller.retryFailedJob);
    Router.del(r, '/:name/dead-letter-queue/:jobId', controller.deleteFailedJob);
    Router.post(r, '/:name/dead-letter-queue/:jobId/anonymize', controller.anonymizeFailedJob);
    Router.get(r, '/:name/dead-letter-queue/audit-log', controller.dlqAuditLog);
    Router.get(r, '/:name/dead-letter-queue/stats', controller.dlqStats);

    // Plugins
    Router.post(r, '/:name/plugins/register', controller.registerPlugin);
    Router.del(r, '/:name/plugins/:pluginId', controller.unregisterPlugin);
    Router.post(r, '/:name/plugins/:pluginId/enable', controller.enablePlugin);
    Router.post(r, '/:name/plugins/:pluginId/disable', controller.disablePlugin);
    Router.get(r, '/:name/plugins', controller.listPlugins);
    Router.get(r, '/:name/plugins/:pluginId/history', controller.pluginExecutionHistory);
    Router.get(r, '/:name/plugins/statistics', controller.pluginStatistics);

    // Multi-queue support
    Router.post(r, '/:name/queues', controller.createMultiQueue);
    Router.post(r, '/:name/queues/:queueName/start', controller.startQueue);
    Router.post(r, '/:name/queues/:queueName/stop', controller.stopQueue);
    Router.get(r, '/:name/queues/:queueName/stats', controller.queueStats);
    Router.put(r, '/:name/queues/:queueName/priority', controller.updateQueuePriority);
    Router.put(r, '/:name/queues/:queueName/concurrency', controller.updateQueueConcurrency);
  });
}

function registerDatacenterOrchestrationRoutes(router: IRouter): void {
  Router.group(router, '/api/datacenters', (r: IRouter) => {
    // Region management
    Router.post(r, '/regions', controller.registerRegion);
    Router.del(r, '/regions/:regionId', controller.unregisterRegion);
    Router.get(r, '/regions', controller.listRegions);
    Router.get(r, '/regions/:regionId', controller.getRegion);
    Router.put(r, '/regions/:regionId/health', controller.updateRegionHealth);
    Router.put(r, '/regions/:regionId/load', controller.updateRegionLoad);

    // Worker placement
    Router.post(r, '/placements', controller.placeWorker);
    Router.get(r, '/placements/:workerName', controller.getPlacement);
    Router.put(r, '/placements/:workerName', controller.updatePlacement);
    Router.get(r, '/placements/:workerName/optimal-region', controller.findOptimalRegion);

    // Failover policies
    Router.put(r, '/regions/:regionId/failover-policy', controller.setFailoverPolicy);
    Router.get(r, '/regions/:regionId/failover-policy', controller.getFailoverPolicy);
    Router.post(r, '/regions/:regionId/health-checks/start', controller.startHealthChecks);
    Router.post(r, '/regions/:regionId/health-checks/stop', controller.stopHealthChecks);

    // Topology
    Router.get(r, '/topology', controller.getTopology);
    Router.get(r, '/load-balancing-recommendation', controller.getLoadBalancingRecommendation);
  });
}

function registerAutoScalingRoutes(router: IRouter): void {
  Router.group(router, '/api/auto-scaling', (r: IRouter) => {
    Router.post(r, '/start', controller.startAutoScaling);
    Router.post(r, '/stop', controller.stopAutoScaling);
    Router.post(r, '/evaluate/:workerName', controller.evaluateScaling);
    Router.get(r, '/:workerName/decision', controller.lastScalingDecision);
    Router.get(r, '/:workerName/history', controller.scalingHistory);
    Router.get(r, '/:workerName/cost-summary', controller.costSummary);
    Router.put(r, '/:workerName/policy', controller.setScalingPolicy);
    Router.get(r, '/:workerName/policy', controller.getScalingPolicy);
  });
}

function registerResourceMonitoringRoutes(router: IRouter): void {
  Router.group(router, '/api/resources', (r: IRouter) => {
    Router.post(r, '/stop', controller.stopResourceMonitoring);
    Router.post(r, '/start', controller.startResourceMonitoring);
    Router.get(r, '/current', controller.getCurrentResourceUsage);
    Router.get(r, '/history', controller.resourceHistory);
    Router.get(r, '/alerts', controller.resourceAlerts);
    Router.get(r, '/trends', controller.resourceTrends);
    Router.get(r, '/:workerName/trends', controller.workerResourceTrend);
    Router.put(r, '/cost-config', controller.updateCostConfig);
    Router.get(r, '/projected-cost', controller.calculateProjectedCost);
    Router.get(r, '/system-info', controller.getSystemInfo);
  });
}

function registerComplianceRoutes(router: IRouter): void {
  Router.group(router, '/api/compliance', (r: IRouter) => {
    Router.post(r, '/data-subjects', controller.registerDataSubject);
    Router.post(r, '/consent', controller.recordConsent);
    Router.post(r, '/check', controller.checkCompliance);
    Router.post(r, '/access-requests', controller.createAccessRequest);
    Router.post(r, '/access-requests/:requestId/process', controller.processAccessRequest);
    Router.post(r, '/encrypt', controller.encryptSensitiveData);
    Router.post(r, '/decrypt', controller.decryptSensitiveData);
    Router.post(r, '/violations', controller.recordViolation);
    Router.get(r, '/audit-logs', controller.complianceAuditLogs);
    Router.get(r, '/summary', controller.complianceSummary);
  });
}

function registerObservabilityRoutes(router: IRouter): void {
  Router.group(router, '/api/observability', (r: IRouter) => {
    Router.get(r, '/metrics', controller.prometheusMetrics);
    Router.post(r, '/metrics/custom', controller.recordCustomMetric);
    Router.post(r, '/traces/start', controller.startTrace);
    Router.post(r, '/traces/:spanId/end', controller.endTrace);
  });
}

function registerSystemOperationRoutes(router: IRouter): void {
  Router.group(router, '/api/workers/system', (r: IRouter) => {
    Router.get(r, '/summary', controller.systemSummary);
    Router.post(r, '/shutdown', controller.shutdown);
    Router.get(r, '/monitoring/summary', controller.monitoringSummary);
  });
}

export function registerWorkerRoutes(router: IRouter): void {
  registerWorkerLifecycleRoutes(router);
  registerDatacenterOrchestrationRoutes(router);
  registerAutoScalingRoutes(router);
  registerResourceMonitoringRoutes(router);
  registerComplianceRoutes(router);
  registerObservabilityRoutes(router);
  registerSystemOperationRoutes(router);
  Logger.info('Worker routes registered at http://127.0.0.1:7777/workers');
}

export default registerWorkerRoutes;
