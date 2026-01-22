/**
 * Worker Management System - Public API
 *
 * Central export file for all worker management modules.
 */

// Core Infrastructure
export { ClusterLock } from './ClusterLock';
export { PriorityQueue } from './PriorityQueue';
export { WorkerMetrics } from './WorkerMetrics';
export { WorkerRegistry } from './WorkerRegistry';

// Resilience & Recovery
export { AutoScaler } from './AutoScaler';
export { CircuitBreaker } from './CircuitBreaker';
export { DeadLetterQueue } from './DeadLetterQueue';

// Monitoring & Resources
export { HealthMonitor } from './HealthMonitor';
export { ResourceMonitor } from './ResourceMonitor';
export { SLAMonitor } from './SLAMonitor';

// Compliance & Security
export { ComplianceManager } from './ComplianceManager';

// Observability
export { Observability } from './Observability';

// Plugin System
export { PluginManager } from './PluginManager';

// Advanced Features
export { AnomalyDetection } from './AnomalyDetection';
export { CanaryController } from './CanaryController';
export { ChaosEngineering } from './ChaosEngineering';
export { DatacenterOrchestrator } from './DatacenterOrchestrator';
export { MultiQueueWorker } from './MultiQueueWorker';
export { WorkerVersioning } from './WorkerVersioning';

// Factory & Lifecycle
export { WorkerFactory } from './WorkerFactory';
export type { WorkerPersistenceConfig } from './WorkerFactory';
export { WorkerInit } from './WorkerInit';
export { WorkerShutdown } from './WorkerShutdown';

// HTTP Controllers & Routes
export { WorkerController } from './http/WorkerController';
export { registerWorkerRoutes } from './routes/workers';

// Queue Workers
export { BroadcastWorker } from './BroadcastWorker';
export { createQueueWorker } from './createQueueWorker';

export { NotificationWorker } from './NotificationWorker';

// Re-export types from core config
export type {
  RedisConfig,
  WorkerAutoScalingConfig,
  WorkerComplianceConfig,
  WorkerConfig,
  WorkerCostConfig,
  WorkerObservabilityConfig,
  WorkerStatus,
  WorkerVersioningConfig,
  WorkersConfigOverrides,
  WorkersGlobalConfig,
} from '@zintrust/core';

// Re-export bullmq types for type compatibility
export type { Job, Worker, WorkerOptions } from 'bullmq';

export type {
  IAnomaly,
  IAnomalyConfig,
  IForecast,
  IMetric,
  IPrediction,
  IRecommendation,
  IRootCauseAnalysis,
} from './AnomalyDetection';
export type {
  IChaosComparison,
  IChaosExperiment,
  IChaosReport,
  IChaosStatus,
} from './ChaosEngineering';
export type { ISLAConfig, ISLAReport, ISLAStatus, ISLAViolation, ITimeRange } from './SLAMonitor';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_WORKERS_VERSION = '0.1.0';
export const _ZINTRUST_WORKERS_BUILD_DATE = '__BUILD_DATE__';
