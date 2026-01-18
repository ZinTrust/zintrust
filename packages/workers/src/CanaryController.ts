/**
 * Canary Deployment Controller
 * Gradual rollout with traffic percentage control and automatic rollback
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger } from '@zintrust/core';
import { CircuitBreaker } from './CircuitBreaker';

export type CanaryStage =
  | 'initial'
  | 'ramping'
  | 'monitoring'
  | 'completed'
  | 'rolling-back'
  | 'failed';

export type CanaryDeploymentConfig = {
  workerName: string;
  currentVersion: string;
  canaryVersion: string;
  initialTrafficPercent: number; // Start with this percentage
  targetTrafficPercent: number; // End with this percentage
  incrementPercent: number; // Increase traffic by this amount each step
  incrementInterval: number; // Wait this many seconds between increments
  monitoringDuration: number; // Monitor for this many seconds at each step
  errorThreshold: number; // Rollback if error rate exceeds this (0-1)
  latencyThreshold: number; // Rollback if p95 latency exceeds this (ms)
  minSuccessRate: number; // Rollback if success rate below this (0-1)
  autoRollback: boolean; // Automatically rollback on failure
};

export type CanaryDeployment = {
  config: CanaryDeploymentConfig;
  currentTrafficPercent: number;
  stage: CanaryStage;
  startedAt: Date;
  completedAt?: Date;
  metrics: {
    currentVersion: {
      processed: number;
      errors: number;
      avgLatency: number;
    };
    canaryVersion: {
      processed: number;
      errors: number;
      avgLatency: number;
    };
  };
  history: Array<{
    timestamp: Date;
    trafficPercent: number;
    stage: CanaryStage;
    metrics: CanaryDeployment['metrics'];
    decision: string;
  }>;
};

// Internal state
const canaryDeployments = new Map<string, CanaryDeployment>();
const canaryTimers = new Map<string, NodeJS.Timeout>();
const MAX_HISTORY = 1000;

/**
 * Helper: Calculate error rate
 */
const calculateErrorRate = (processed: number, errors: number): number => {
  if (processed === 0) return 0;
  return errors / processed;
};

/**
 * Helper: Calculate success rate
 */
const calculateSuccessRate = (processed: number, errors: number): number => {
  if (processed === 0) return 1;
  return (processed - errors) / processed;
};

/**
 * Helper: Should rollback based on metrics
 */
const shouldRollback = (deployment: CanaryDeployment): { should: boolean; reason?: string } => {
  const { config, metrics } = deployment;
  const { canaryVersion } = metrics;

  // Check error threshold
  const errorRate = calculateErrorRate(canaryVersion.processed, canaryVersion.errors);
  if (errorRate > config.errorThreshold) {
    return {
      should: true,
      reason: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(config.errorThreshold * 100).toFixed(2)}%`,
    };
  }

  // Check success rate
  const successRate = calculateSuccessRate(canaryVersion.processed, canaryVersion.errors);
  if (successRate < config.minSuccessRate) {
    return {
      should: true,
      reason: `Success rate ${(successRate * 100).toFixed(2)}% below minimum ${(config.minSuccessRate * 100).toFixed(2)}%`,
    };
  }

  // Check latency threshold
  if (canaryVersion.avgLatency > config.latencyThreshold) {
    return {
      should: true,
      reason: `P95 latency ${canaryVersion.avgLatency}ms exceeds threshold ${config.latencyThreshold}ms`,
    };
  }

  return { should: false };
};

/**
 * Helper: Increment traffic
 */
const incrementTraffic = (workerName: string): void => {
  const deployment = canaryDeployments.get(workerName);

  if (!deployment) {
    Logger.error('Canary deployment not found', { workerName });
    return;
  }

  const { config } = deployment;

  // Check if we should rollback
  const rollbackCheck = shouldRollback(deployment);
  if (rollbackCheck.should && config.autoRollback) {
    Logger.warn('Auto-rollback triggered', {
      workerName,
      reason: rollbackCheck.reason,
    });

    CanaryController.rollback(workerName, rollbackCheck.reason ?? '');
    return;
  }

  // Increment traffic
  const newTrafficPercent = Math.min(
    deployment.currentTrafficPercent + config.incrementPercent,
    config.targetTrafficPercent
  );

  deployment.currentTrafficPercent = newTrafficPercent;

  // Record history
  appendHistory(deployment, {
    timestamp: new Date(),
    trafficPercent: newTrafficPercent,
    stage: deployment.stage,
    metrics: { ...deployment.metrics },
    decision: `Traffic increased to ${newTrafficPercent}%`,
  });
  Logger.info('Canary traffic incremented', {
    workerName,
    trafficPercent: newTrafficPercent,
    targetPercent: config.targetTrafficPercent,
  });

  // Check if we've reached the target
  if (newTrafficPercent >= config.targetTrafficPercent) {
    deployment.stage = 'monitoring';

    // Wait for final monitoring period
    const existingCompleteTimer = canaryTimers.get(`${workerName}:complete`);
    if (existingCompleteTimer) {
      clearTimeout(existingCompleteTimer);
      canaryTimers.delete(`${workerName}:complete`);
    }

    // eslint-disable-next-line no-restricted-syntax
    const timer = setTimeout(() => {
      CanaryController.complete(workerName);
    }, config.monitoringDuration * 1000);

    canaryTimers.set(`${workerName}:complete`, timer);
  } else {
    // Schedule next increment
    const existingTimer = canaryTimers.get(workerName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      canaryTimers.delete(workerName);
    }

    // eslint-disable-next-line no-restricted-syntax
    const timer = setTimeout(() => {
      incrementTraffic(workerName);
    }, config.incrementInterval * 1000);

    canaryTimers.set(workerName, timer);
  }
};

const appendHistory = (
  deployment: CanaryDeployment,
  entry: CanaryDeployment['history'][number]
): void => {
  deployment.history.push(entry);
  if (deployment.history.length > MAX_HISTORY) {
    deployment.history.shift();
  }
};

/**
 * Canary Deployment Controller - Sealed namespace
 */
export const CanaryController = Object.freeze({
  /**
   * Start canary deployment
   */
  start(config: CanaryDeploymentConfig): void {
    const { workerName } = config;

    if (canaryDeployments.has(workerName)) {
      throw ErrorFactory.createGeneralError(
        `Canary deployment already in progress for "${workerName}"`
      );
    }

    // Validate config
    if (config.initialTrafficPercent < 0 || config.initialTrafficPercent > 100) {
      throw ErrorFactory.createValidationError('Initial traffic percent must be between 0 and 100');
    }

    if (
      config.targetTrafficPercent < config.initialTrafficPercent ||
      config.targetTrafficPercent > 100
    ) {
      throw ErrorFactory.createValidationError(
        'Target traffic percent must be >= initial and <= 100'
      );
    }

    // Create deployment
    const deployment: CanaryDeployment = {
      config,
      currentTrafficPercent: config.initialTrafficPercent,
      stage: 'initial',
      startedAt: new Date(),
      metrics: {
        currentVersion: { processed: 0, errors: 0, avgLatency: 0 },
        canaryVersion: { processed: 0, errors: 0, avgLatency: 0 },
      },
      history: [],
    };

    canaryDeployments.set(workerName, deployment);

    Logger.info('Canary deployment started', {
      workerName,
      currentVersion: config.currentVersion,
      canaryVersion: config.canaryVersion,
      initialTraffic: config.initialTrafficPercent,
    });

    // Start ramping up
    deployment.stage = 'ramping';

    // Schedule first increment
    const existingTimer = canaryTimers.get(workerName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      canaryTimers.delete(workerName);
    }

    // eslint-disable-next-line no-restricted-syntax
    const timer = setTimeout(() => {
      incrementTraffic(workerName);
    }, config.monitoringDuration * 1000);

    canaryTimers.set(workerName, timer);
  },

  /**
   * Pause canary deployment
   */
  pause(workerName: string): void {
    const deployment = canaryDeployments.get(workerName);

    if (!deployment) {
      throw ErrorFactory.createNotFoundError(`Canary deployment not found for "${workerName}"`);
    }

    // Clear timer
    const timer = canaryTimers.get(workerName);
    if (timer) {
      clearTimeout(timer);
      canaryTimers.delete(workerName);
    }

    Logger.info('Canary deployment paused', { workerName });
  },

  /**
   * Resume canary deployment
   */
  resume(workerName: string): void {
    const deployment = canaryDeployments.get(workerName);

    if (!deployment) {
      throw ErrorFactory.createNotFoundError(`Canary deployment not found for "${workerName}"`);
    }

    // Resume incrementing
    const existingTimer = canaryTimers.get(workerName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      canaryTimers.delete(workerName);
    }

    // eslint-disable-next-line no-restricted-syntax
    const timer = setTimeout(() => {
      incrementTraffic(workerName);
    }, deployment.config.incrementInterval * 1000);

    canaryTimers.set(workerName, timer);

    Logger.info('Canary deployment resumed', { workerName });
  },

  /**
   * Complete canary deployment
   */
  complete(workerName: string): void {
    const deployment = canaryDeployments.get(workerName);

    if (!deployment) {
      throw ErrorFactory.createNotFoundError(`Canary deployment not found for "${workerName}"`);
    }

    deployment.stage = 'completed';
    deployment.completedAt = new Date();

    // Clear timers
    const timer = canaryTimers.get(workerName);
    if (timer) {
      clearTimeout(timer);
      canaryTimers.delete(workerName);
    }

    const completeTimer = canaryTimers.get(`${workerName}:complete`);
    if (completeTimer) {
      clearTimeout(completeTimer);
      canaryTimers.delete(`${workerName}:complete`);
    }

    // Record completion in history
    appendHistory(deployment, {
      timestamp: new Date(),
      trafficPercent: deployment.currentTrafficPercent,
      stage: 'completed',
      metrics: { ...deployment.metrics },
      decision: 'Deployment completed successfully',
    });

    Logger.info('Canary deployment completed', {
      workerName,
      duration: deployment.completedAt.getTime() - deployment.startedAt.getTime(),
    });
  },

  /**
   * Rollback canary deployment
   */
  rollback(workerName: string, reason: string): void {
    const deployment = canaryDeployments.get(workerName);

    if (!deployment) {
      throw ErrorFactory.createNotFoundError(`Canary deployment not found for "${workerName}"`);
    }

    deployment.stage = 'rolling-back';

    // Clear timers
    const timer = canaryTimers.get(workerName);
    if (timer) {
      clearTimeout(timer);
      canaryTimers.delete(workerName);
    }

    // Roll back traffic to 0%
    deployment.currentTrafficPercent = 0;

    // Record rollback in history
    appendHistory(deployment, {
      timestamp: new Date(),
      trafficPercent: 0,
      stage: 'rolling-back',
      metrics: { ...deployment.metrics },
      decision: `Rollback initiated: ${reason}`,
    });

    deployment.stage = 'failed';
    deployment.completedAt = new Date();

    Logger.error('Canary deployment rolled back', { workerName, reason });

    // Optional: Open circuit breaker for canary version
    CircuitBreaker.forceOpen(workerName, deployment.config.canaryVersion, reason);
  },

  /**
   * Get canary deployment status
   */
  getStatus(workerName: string): CanaryDeployment | null {
    const deployment = canaryDeployments.get(workerName);
    return deployment ? { ...deployment } : null;
  },

  /**
   * Update metrics for canary deployment
   */
  updateMetrics(
    workerName: string,
    version: string,
    processed: number,
    errors: number,
    avgLatency: number
  ): void {
    const deployment = canaryDeployments.get(workerName);

    if (!deployment) {
      return;
    }

    if (version === deployment.config.currentVersion) {
      deployment.metrics.currentVersion = { processed, errors, avgLatency };
    } else if (version === deployment.config.canaryVersion) {
      deployment.metrics.canaryVersion = { processed, errors, avgLatency };
    }
  },

  /**
   * Route job to version based on traffic percentage
   */
  routeJob(workerName: string): string | null {
    const deployment = canaryDeployments.get(workerName);

    if (!deployment || deployment.stage === 'completed' || deployment.stage === 'failed') {
      return null; // No active canary
    }

    // Random routing based on traffic percentage
    const random = Math.random() * 100; // NOSONAR

    if (random < deployment.currentTrafficPercent) {
      return deployment.config.canaryVersion;
    }

    return deployment.config.currentVersion;
  },

  /**
   * List all canary deployments
   */
  listDeployments(): string[] {
    return Array.from(canaryDeployments.keys());
  },

  /**
   * Get deployment history
   */
  getHistory(workerName: string): CanaryDeployment['history'] | null {
    const deployment = canaryDeployments.get(workerName);
    return deployment ? [...deployment.history] : null;
  },

  /**
   * Remove completed/failed deployment
   */
  remove(workerName: string): void {
    const deployment = canaryDeployments.get(workerName);

    if (!deployment) {
      throw ErrorFactory.createNotFoundError(`Canary deployment not found for "${workerName}"`);
    }

    if (deployment.stage !== 'completed' && deployment.stage !== 'failed') {
      throw ErrorFactory.createValidationError(
        'Cannot remove active deployment. Pause or complete it first.'
      );
    }

    canaryDeployments.delete(workerName);

    Logger.info('Canary deployment removed', { workerName });
  },

  /**
   * Purge deployment data (force cleanup)
   */
  purge(workerName: string): void {
    const timer = canaryTimers.get(workerName);
    if (timer) {
      clearTimeout(timer);
      canaryTimers.delete(workerName);
    }

    const completionTimer = canaryTimers.get(`${workerName}:complete`);
    if (completionTimer) {
      clearTimeout(completionTimer);
      canaryTimers.delete(`${workerName}:complete`);
    }

    canaryDeployments.delete(workerName);
    Logger.info('Canary deployment purged', { workerName });
  },

  /**
   * Shutdown all canary deployments
   */
  shutdown(): void {
    Logger.info('CanaryController shutting down...');

    // Clear all timers
    for (const timer of canaryTimers.values()) {
      clearTimeout(timer);
    }
    canaryTimers.clear();

    canaryDeployments.clear();

    Logger.info('CanaryController shutdown complete');
  },
});

// Graceful shutdown on process termination
process.on('SIGTERM', () => {
  CanaryController.shutdown();
});

process.on('SIGINT', () => {
  CanaryController.shutdown();
});
