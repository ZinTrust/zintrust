/**
 * Worker Management Routes
 * HTTP API for managing workers with all enterprise features
 */

import { Logger, Router, type IRouter } from '@zintrust/core';
import { WorkerController } from '../http/WorkerController';

const controller = WorkerController.create();

function registerWorkerLifecycleRoutes(router: IRouter): void {
  Logger.info('Registering Worker Management Routes');
  Router.group(router, '/api/workers', () => {
    // Core worker operations
    Router.post(router, '/create', controller.create);
    Router.post(router, '/:name/start', controller.start);
    Router.post(router, '/:name/stop', controller.stop);
    Router.post(router, '/:name/restart', controller.restart);
    Router.post(router, '/:name/pause', controller.pause);
    Router.post(router, '/:name/resume', controller.resume);
    Router.del(router, '/:name', controller.remove);

    // Worker information
    Router.get(router, '/', controller.list);
    Router.get(router, '/:name', controller.get);
    Router.get(router, '/:name/status', controller.status);
    Router.get(router, '/:name/metrics', controller.metrics);
    Router.get(router, '/:name/health', controller.health);

    // Health monitoring
    Router.post(router, '/:name/monitoring/start', controller.startMonitoring);
    Router.post(router, '/:name/monitoring/stop', controller.stopMonitoring);
    Router.get(router, '/:name/monitoring/history', controller.healthHistory);
    Router.get(router, '/:name/monitoring/trend', controller.healthTrend);
    Router.put(router, '/:name/monitoring/config', controller.updateMonitoringConfig);

    // Versioning
    Router.post(router, '/:name/versions', controller.registerVersion);
    Router.get(router, '/:name/versions', controller.listVersions);
    Router.get(router, '/:name/versions/:version', controller.getVersion);
    Router.post(router, '/:name/versions/:version/deprecate', controller.deprecateVersion);
    Router.post(router, '/:name/versions/:version/activate', controller.activateVersion);
    Router.post(router, '/:name/versions/:version/deactivate', controller.deactivateVersion);
    Router.post(router, '/:name/versions/compatibility', controller.checkCompatibility);

    // Canary deployments
    Router.post(router, '/:name/canary/start', controller.startCanary);
    Router.post(router, '/:name/canary/pause', controller.pauseCanary);
    Router.post(router, '/:name/canary/resume', controller.resumeCanary);
    Router.post(router, '/:name/canary/rollback', controller.rollbackCanary);
    Router.get(router, '/:name/canary/status', controller.canaryStatus);
    Router.get(router, '/:name/canary/history', controller.canaryHistory);

    // Circuit breaker
    Router.get(router, '/:name/circuit-breaker', controller.circuitBreakerState);
    Router.post(router, '/:name/circuit-breaker/reset', controller.resetCircuitBreaker);
    Router.post(router, '/:name/circuit-breaker/force-open', controller.forceOpenCircuit);
    Router.get(router, '/:name/circuit-breaker/events', controller.circuitBreakerEvents);

    // Dead letter queue
    Router.get(router, '/:name/dead-letter-queue', controller.listFailedJobs);
    Router.get(router, '/:name/dead-letter-queue/:jobId', controller.getFailedJob);
    Router.post(router, '/:name/dead-letter-queue/:jobId/retry', controller.retryFailedJob);
    Router.del(router, '/:name/dead-letter-queue/:jobId', controller.deleteFailedJob);
    Router.post(router, '/:name/dead-letter-queue/:jobId/anonymize', controller.anonymizeFailedJob);
    Router.get(router, '/:name/dead-letter-queue/audit-log', controller.dlqAuditLog);
    Router.get(router, '/:name/dead-letter-queue/stats', controller.dlqStats);

    // Plugins
    Router.post(router, '/:name/plugins/register', controller.registerPlugin);
    Router.del(router, '/:name/plugins/:pluginId', controller.unregisterPlugin);
    Router.post(router, '/:name/plugins/:pluginId/enable', controller.enablePlugin);
    Router.post(router, '/:name/plugins/:pluginId/disable', controller.disablePlugin);
    Router.get(router, '/:name/plugins', controller.listPlugins);
    Router.get(router, '/:name/plugins/:pluginId/history', controller.pluginExecutionHistory);
    Router.get(router, '/:name/plugins/statistics', controller.pluginStatistics);

    // Multi-queue support
    Router.post(router, '/:name/queues', controller.createMultiQueue);
    Router.post(router, '/:name/queues/:queueName/start', controller.startQueue);
    Router.post(router, '/:name/queues/:queueName/stop', controller.stopQueue);
    Router.get(router, '/:name/queues/:queueName/stats', controller.queueStats);
    Router.put(router, '/:name/queues/:queueName/priority', controller.updateQueuePriority);
    Router.put(router, '/:name/queues/:queueName/concurrency', controller.updateQueueConcurrency);
  });
}

function registerDatacenterOrchestrationRoutes(router: IRouter): void {
  Router.group(router, '/api/datacenters', () => {
    // Region management
    Router.post(router, '/regions', controller.registerRegion);
    Router.del(router, '/regions/:regionId', controller.unregisterRegion);
    Router.get(router, '/regions', controller.listRegions);
    Router.get(router, '/regions/:regionId', controller.getRegion);
    Router.put(router, '/regions/:regionId/health', controller.updateRegionHealth);
    Router.put(router, '/regions/:regionId/load', controller.updateRegionLoad);

    // Worker placement
    Router.post(router, '/placements', controller.placeWorker);
    Router.get(router, '/placements/:workerName', controller.getPlacement);
    Router.put(router, '/placements/:workerName', controller.updatePlacement);
    Router.get(router, '/placements/:workerName/optimal-region', controller.findOptimalRegion);

    // Failover policies
    Router.put(router, '/regions/:regionId/failover-policy', controller.setFailoverPolicy);
    Router.get(router, '/regions/:regionId/failover-policy', controller.getFailoverPolicy);
    Router.post(router, '/regions/:regionId/health-checks/start', controller.startHealthChecks);
    Router.post(router, '/regions/:regionId/health-checks/stop', controller.stopHealthChecks);

    // Topology
    Router.get(router, '/topology', controller.getTopology);
    Router.get(router, '/load-balancing-recommendation', controller.getLoadBalancingRecommendation);
  });
}

function registerAutoScalingRoutes(router: IRouter): void {
  Router.group(router, '/api/auto-scaling', () => {
    Router.post(router, '/start', controller.startAutoScaling);
    Router.post(router, '/stop', controller.stopAutoScaling);
    Router.post(router, '/evaluate/:workerName', controller.evaluateScaling);
    Router.get(router, '/:workerName/decision', controller.lastScalingDecision);
    Router.get(router, '/:workerName/history', controller.scalingHistory);
    Router.get(router, '/:workerName/cost-summary', controller.costSummary);
    Router.put(router, '/:workerName/policy', controller.setScalingPolicy);
    Router.get(router, '/:workerName/policy', controller.getScalingPolicy);
  });
}

function registerResourceMonitoringRoutes(router: IRouter): void {
  Router.group(router, '/api/resources', () => {
    Router.get(router, '/current', controller.getCurrentResourceUsage);
    Router.get(router, '/history', controller.resourceHistory);
    Router.get(router, '/alerts', controller.resourceAlerts);
    Router.get(router, '/trends', controller.resourceTrends);
    Router.get(router, '/:workerName/trends', controller.workerResourceTrend);
    Router.put(router, '/cost-config', controller.updateCostConfig);
    Router.get(router, '/projected-cost', controller.calculateProjectedCost);
    Router.get(router, '/system-info', controller.getSystemInfo);
  });
}

function registerComplianceRoutes(router: IRouter): void {
  Router.group(router, '/api/compliance', () => {
    Router.post(router, '/data-subjects', controller.registerDataSubject);
    Router.post(router, '/consent', controller.recordConsent);
    Router.post(router, '/check', controller.checkCompliance);
    Router.post(router, '/access-requests', controller.createAccessRequest);
    Router.post(router, '/access-requests/:requestId/process', controller.processAccessRequest);
    Router.post(router, '/encrypt', controller.encryptSensitiveData);
    Router.post(router, '/decrypt', controller.decryptSensitiveData);
    Router.post(router, '/violations', controller.recordViolation);
    Router.get(router, '/audit-logs', controller.complianceAuditLogs);
    Router.get(router, '/summary', controller.complianceSummary);
  });
}

function registerObservabilityRoutes(router: IRouter): void {
  Router.group(router, '/api/observability', () => {
    Router.get(router, '/metrics', controller.prometheusMetrics);
    Router.post(router, '/metrics/custom', controller.recordCustomMetric);
    Router.post(router, '/traces/start', controller.startTrace);
    Router.post(router, '/traces/:spanId/end', controller.endTrace);
  });
}

function registerSystemOperationRoutes(router: IRouter): void {
  Router.group(router, '/api/workers/system', () => {
    Router.get(router, '/summary', controller.systemSummary);
    Router.post(router, '/shutdown', controller.shutdown);
    Router.get(router, '/monitoring/summary', controller.monitoringSummary);
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
}

export default registerWorkerRoutes;
