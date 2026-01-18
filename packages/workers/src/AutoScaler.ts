/**
 * Worker Auto-Scaler
 * Automatic worker scaling based on queue depth, resource usage, and cost optimization
 * Sealed namespace for immutability
 */

import type { WorkerConfig } from '@zintrust/core';
import { ErrorFactory, Logger, workersConfig } from '@zintrust/core';

export type ScalingDecision = {
  workerName: string;
  action: 'scale-up' | 'scale-down' | 'no-change';
  currentConcurrency: number;
  targetConcurrency: number;
  reason: string;
  metrics: {
    queueDepth: number;
    avgProcessingTime: number;
    cpuUsage: number;
    memoryUsage: number;
    errorRate: number;
    costPerHour: number;
  };
  timestamp: Date;
};

export type ScalingPolicy = {
  minConcurrency: number;
  maxConcurrency: number;
  scaleUpThreshold: {
    queueDepth: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  scaleDownThreshold: {
    queueDepth: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  cooldownPeriod: number; // seconds
  aggressiveness: 'conservative' | 'moderate' | 'aggressive';
};

export type CostOptimizationStrategy = {
  enabled: boolean;
  maxCostPerHour: number;
  preferSpotInstances: boolean;
  offPeakSchedule?: {
    start: string; // HH:MM format
    end: string; // HH:MM format
    timezone: string;
    reductionPercentage: number; // 0-100
  };
  budgetAlerts: {
    dailyLimit: number;
    weeklyLimit: number;
    monthlyLimit: number;
  };
};

export type AutoScalerConfig = {
  enabled: boolean;
  checkInterval: number; // seconds
  scalingPolicies: Map<string, ScalingPolicy>;
  costOptimization: CostOptimizationStrategy;
};

// Internal state
let config: AutoScalerConfig | null = null;
let scalingInterval: NodeJS.Timeout | null = null;
const lastScalingDecisions = new Map<string, ScalingDecision>();
const scalingHistory = new Map<string, ScalingDecision[]>();

// Cost tracking
let currentHourlyCost = 0;
let dailyCost = 0;
let weeklyCost = 0;
let monthlyCost = 0;
const lastCostReset = {
  daily: new Date(),
  weekly: new Date(),
  monthly: new Date(),
};

/**
 * Helper: Reset cost counters if period has passed
 */
const resetCostCountersIfNeeded = (): void => {
  const now = new Date();

  // Daily reset (midnight UTC)
  const lastDailyReset = new Date(lastCostReset.daily);
  lastDailyReset.setUTCHours(0, 0, 0, 0);
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  if (todayMidnight > lastDailyReset) {
    dailyCost = 0;
    lastCostReset.daily = now;
    Logger.info('Daily cost counter reset');
  }

  // Weekly reset (Sunday midnight UTC)
  const dayOfWeek = now.getUTCDay();
  const lastWeeklyReset = new Date(lastCostReset.weekly);
  const daysSinceLastReset = Math.floor(
    (now.getTime() - lastWeeklyReset.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysSinceLastReset >= 7 || (dayOfWeek === 0 && now.getUTCHours() === 0)) {
    weeklyCost = 0;
    lastCostReset.weekly = now;
    Logger.info('Weekly cost counter reset');
  }

  // Monthly reset (1st of month midnight UTC)
  if (now.getUTCDate() === 1 && now.getUTCDate() !== lastCostReset.monthly.getUTCDate()) {
    monthlyCost = 0;
    lastCostReset.monthly = now;
    Logger.info('Monthly cost counter reset');
  }
};

/**
 * Helper: Check if in off-peak period
 */
const isOffPeakPeriod = (schedule?: CostOptimizationStrategy['offPeakSchedule']): boolean => {
  if (!schedule) return false;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: schedule.timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  const [currentHour, currentMinute] = timeStr.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = schedule.start.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;

  const [endHour, endMinute] = schedule.end.split(':').map(Number);
  const endMinutes = endHour * 60 + endMinute;

  // Handle cases where period crosses midnight
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};

/**
 * Helper: Calculate scaling step based on aggressiveness
 */
const calculateScalingStep = (
  currentConcurrency: number,
  aggressiveness: ScalingPolicy['aggressiveness']
): number => {
  const baseStep = Math.max(1, Math.ceil(currentConcurrency * 0.1)); // 10% of current

  switch (aggressiveness) {
    case 'conservative':
      return Math.max(1, Math.ceil(baseStep * 0.5)); // 5% increase
    case 'moderate':
      return baseStep; // 10% increase
    case 'aggressive':
      return Math.ceil(baseStep * 2); // 20% increase
  }
};

/**
 * Helper: Check if cooldown period has passed
 */
const canScale = (workerName: string, cooldownPeriod: number): boolean => {
  const lastDecision = lastScalingDecisions.get(workerName);

  if (!lastDecision || lastDecision.action === 'no-change') {
    return true;
  }

  const elapsedSeconds = (Date.now() - lastDecision.timestamp.getTime()) / 1000;
  return elapsedSeconds >= cooldownPeriod;
};

/**
 * Helper: Check budget constraints
 */
const checkBudgetConstraints = (additionalCost: number): { allowed: boolean; reason?: string } => {
  if (config?.costOptimization?.enabled === undefined) {
    return { allowed: true };
  }

  resetCostCountersIfNeeded();

  const { budgetAlerts } = config.costOptimization;

  // Check daily limit
  if (dailyCost + additionalCost > budgetAlerts.dailyLimit) {
    return {
      allowed: false,
      reason: `Would exceed daily budget: $${(dailyCost + additionalCost).toFixed(2)} > $${budgetAlerts.dailyLimit}`,
    };
  }

  // Check weekly limit
  if (weeklyCost + additionalCost > budgetAlerts.weeklyLimit) {
    return {
      allowed: false,
      reason: `Would exceed weekly budget: $${(weeklyCost + additionalCost).toFixed(2)} > $${budgetAlerts.weeklyLimit}`,
    };
  }

  // Check monthly limit
  if (monthlyCost + additionalCost > budgetAlerts.monthlyLimit) {
    return {
      allowed: false,
      reason: `Would exceed monthly budget: $${(monthlyCost + additionalCost).toFixed(2)} > $${budgetAlerts.monthlyLimit}`,
    };
  }

  return { allowed: true };
};

/**
 * Helper: Make scaling decision for a worker
 */
const buildDecision = (
  workerName: string,
  action: ScalingDecision['action'],
  currentConcurrency: number,
  targetConcurrency: number,
  reason: string,
  metrics: ScalingDecision['metrics']
): ScalingDecision => ({
  workerName,
  action,
  currentConcurrency,
  targetConcurrency,
  reason,
  metrics,
  timestamp: new Date(),
});

const getOffPeakDecision = (
  workerName: string,
  policy: ScalingPolicy,
  currentConcurrency: number,
  metrics: ScalingDecision['metrics']
): ScalingDecision | null => {
  if (config?.costOptimization.enabled === undefined) return null;

  const schedule = config.costOptimization.offPeakSchedule;
  if (!schedule || !isOffPeakPeriod(schedule)) return null;

  const reductionPercentage = schedule.reductionPercentage;
  const targetConcurrency = Math.max(
    policy.minConcurrency,
    Math.ceil(currentConcurrency * (1 - reductionPercentage / 100))
  );

  if (targetConcurrency >= currentConcurrency) return null;

  return buildDecision(
    workerName,
    'scale-down',
    currentConcurrency,
    targetConcurrency,
    `Off-peak reduction: ${reductionPercentage}%`,
    metrics
  );
};

const getScaleUpDecision = (
  workerName: string,
  policy: ScalingPolicy,
  currentConcurrency: number,
  metrics: ScalingDecision['metrics']
): ScalingDecision | null => {
  const shouldScaleUp =
    metrics.queueDepth > policy.scaleUpThreshold.queueDepth ||
    metrics.cpuUsage > policy.scaleUpThreshold.cpuUsage ||
    metrics.memoryUsage > policy.scaleUpThreshold.memoryUsage;

  if (!shouldScaleUp || currentConcurrency >= policy.maxConcurrency) return null;

  const step = calculateScalingStep(currentConcurrency, policy.aggressiveness);
  const targetConcurrency = Math.min(policy.maxConcurrency, currentConcurrency + step);
  const additionalCost = metrics.costPerHour * (targetConcurrency - currentConcurrency);
  const budgetCheck = checkBudgetConstraints(additionalCost);

  if (!budgetCheck.allowed) {
    return buildDecision(
      workerName,
      'no-change',
      currentConcurrency,
      currentConcurrency,
      budgetCheck.reason ?? 'Budget constraints prevent scale-up',
      metrics
    );
  }

  const reasons: string[] = [];
  if (metrics.queueDepth > policy.scaleUpThreshold.queueDepth) {
    reasons.push(`Queue depth: ${metrics.queueDepth} > ${policy.scaleUpThreshold.queueDepth}`);
  }
  if (metrics.cpuUsage > policy.scaleUpThreshold.cpuUsage) {
    reasons.push(`CPU usage: ${metrics.cpuUsage}% > ${policy.scaleUpThreshold.cpuUsage}%`);
  }
  if (metrics.memoryUsage > policy.scaleUpThreshold.memoryUsage) {
    reasons.push(`Memory usage: ${metrics.memoryUsage}% > ${policy.scaleUpThreshold.memoryUsage}%`);
  }

  return buildDecision(
    workerName,
    'scale-up',
    currentConcurrency,
    targetConcurrency,
    reasons.join('; '),
    metrics
  );
};

const getScaleDownDecision = (
  workerName: string,
  policy: ScalingPolicy,
  currentConcurrency: number,
  metrics: ScalingDecision['metrics']
): ScalingDecision | null => {
  const shouldScaleDown =
    metrics.queueDepth < policy.scaleDownThreshold.queueDepth &&
    metrics.cpuUsage < policy.scaleDownThreshold.cpuUsage &&
    metrics.memoryUsage < policy.scaleDownThreshold.memoryUsage;

  if (!shouldScaleDown || currentConcurrency <= policy.minConcurrency) return null;

  const step = calculateScalingStep(currentConcurrency, policy.aggressiveness);
  const targetConcurrency = Math.max(policy.minConcurrency, currentConcurrency - step);

  return buildDecision(
    workerName,
    'scale-down',
    currentConcurrency,
    targetConcurrency,
    `Low utilization: Queue=${metrics.queueDepth}, CPU=${metrics.cpuUsage}%, Mem=${metrics.memoryUsage}%`,
    metrics
  );
};

const makeScalingDecision = (
  workerName: string,
  workerConfig: Partial<WorkerConfig>,
  metrics: ScalingDecision['metrics']
): ScalingDecision => {
  if (!config) {
    throw ErrorFactory.createGeneralError('AutoScaler not configured');
  }

  const policy = config.scalingPolicies.get(workerName) ?? getDefaultScalingPolicy(workerConfig);
  const currentConcurrency = workerConfig.concurrency ?? 1;

  if (!canScale(workerName, policy.cooldownPeriod)) {
    return buildDecision(
      workerName,
      'no-change',
      currentConcurrency,
      currentConcurrency,
      'Cooldown period not elapsed',
      metrics
    );
  }

  const offPeakDecision = getOffPeakDecision(workerName, policy, currentConcurrency, metrics);
  if (offPeakDecision) return offPeakDecision;

  const scaleUpDecision = getScaleUpDecision(workerName, policy, currentConcurrency, metrics);
  if (scaleUpDecision) return scaleUpDecision;

  const scaleDownDecision = getScaleDownDecision(workerName, policy, currentConcurrency, metrics);
  if (scaleDownDecision) return scaleDownDecision;

  return buildDecision(
    workerName,
    'no-change',
    currentConcurrency,
    currentConcurrency,
    'Metrics within acceptable range',
    metrics
  );
};

/**
 * Helper: Get default scaling policy from worker config
 */
const getDefaultScalingPolicy = (workerConfig: Partial<WorkerConfig>): ScalingPolicy => {
  const autoScaling = workerConfig.autoScaling;

  return {
    minConcurrency: autoScaling?.minConcurrency ?? 1,
    maxConcurrency: autoScaling?.maxConcurrency ?? 10,
    scaleUpThreshold: {
      queueDepth: autoScaling?.scaleUpThreshold ?? 100,
      cpuUsage: 70,
      memoryUsage: 80,
    },
    scaleDownThreshold: {
      queueDepth: autoScaling?.scaleDownThreshold ?? 10,
      cpuUsage: 30,
      memoryUsage: 40,
    },
    cooldownPeriod: autoScaling?.cooldownPeriod ?? 300, // 5 minutes
    aggressiveness: 'moderate',
  };
};

/**
 * Helper: Record scaling decision
 */
const recordScalingDecision = (decision: ScalingDecision): void => {
  lastScalingDecisions.set(decision.workerName, decision);

  // Add to history
  let history = scalingHistory.get(decision.workerName);
  if (!history) {
    history = [];
    scalingHistory.set(decision.workerName, history);
  }

  history.push(decision);

  // Keep only last 1000 decisions
  if (history.length > 1000) {
    history.shift();
  }

  // Update cost tracking
  if (decision.action === 'scale-up') {
    const additionalCost =
      decision.metrics.costPerHour * (decision.targetConcurrency - decision.currentConcurrency);
    currentHourlyCost += additionalCost;
    dailyCost += additionalCost;
    weeklyCost += additionalCost;
    monthlyCost += additionalCost;
  }
};

/**
 * Worker Auto-Scaler - Sealed namespace
 */
export const AutoScaler = Object.freeze({
  /**
   * Initialize auto-scaler with configuration
   */
  initialize(autoScalerConfig: AutoScalerConfig): void {
    if (config) {
      Logger.warn('AutoScaler already initialized');
      return;
    }

    config = autoScalerConfig;

    if (config.enabled) {
      AutoScaler.start();
    }

    Logger.info('AutoScaler initialized', { enabled: config.enabled });
  },

  /**
   * Start auto-scaling checks
   */
  start(): void {
    if (!config) {
      throw ErrorFactory.createConfigError('AutoScaler not initialized');
    }

    if (scalingInterval) {
      Logger.warn('AutoScaler already running');
      return;
    }

    if (!config.enabled) {
      Logger.warn('AutoScaler is disabled in config');
      return;
    }

    scalingInterval = setInterval(() => {
      // Scaling checks will be triggered externally via evaluate()
      // This interval is just a keepalive
    }, config.checkInterval * 1000);

    Logger.info('AutoScaler started', { checkInterval: config.checkInterval });
  },

  /**
   * Stop auto-scaling checks
   */
  stop(): void {
    if (scalingInterval) {
      clearInterval(scalingInterval);
      scalingInterval = null;
      Logger.info('AutoScaler stopped');
    }
  },

  /**
   * Evaluate scaling decision for a worker
   */
  evaluate(workerName: string, metrics: ScalingDecision['metrics']): ScalingDecision {
    if (!config) {
      throw ErrorFactory.createConfigError('AutoScaler not initialized');
    }

    const workerConfig: Partial<WorkerConfig> = workersConfig.defaultWorker;

    const decision = makeScalingDecision(workerName, workerConfig, metrics);
    recordScalingDecision(decision);

    if (decision.action !== 'no-change') {
      Logger.info(`Scaling decision for ${workerName}`, {
        action: decision.action,
        from: decision.currentConcurrency,
        to: decision.targetConcurrency,
        reason: decision.reason,
      });
    }

    return decision;
  },

  /**
   * Get last scaling decision
   */
  getLastDecision(workerName: string): ScalingDecision | null {
    return lastScalingDecisions.get(workerName) ?? null;
  },

  /**
   * Get scaling history
   */
  getHistory(workerName: string, limit = 100): ReadonlyArray<ScalingDecision> {
    const history = scalingHistory.get(workerName) ?? [];
    return history.slice(-limit);
  },

  /**
   * Clear scaling history for a worker
   */
  clearHistory(workerName: string): void {
    lastScalingDecisions.delete(workerName);
    scalingHistory.delete(workerName);
    Logger.info(`Cleared auto-scaling history for ${workerName}`);
  },

  /**
   * Get cost summary
   */
  getCostSummary(): {
    currentHourlyCost: number;
    dailyCost: number;
    weeklyCost: number;
    monthlyCost: number;
    budgetLimits: CostOptimizationStrategy['budgetAlerts'];
    utilizationPercentage: {
      daily: number;
      weekly: number;
      monthly: number;
    };
  } {
    if (config?.costOptimization.enabled === undefined) {
      return {
        currentHourlyCost: 0,
        dailyCost: 0,
        weeklyCost: 0,
        monthlyCost: 0,
        budgetLimits: { dailyLimit: 0, weeklyLimit: 0, monthlyLimit: 0 },
        utilizationPercentage: { daily: 0, weekly: 0, monthly: 0 },
      };
    }

    resetCostCountersIfNeeded();

    const { budgetAlerts } = config.costOptimization;

    return {
      currentHourlyCost,
      dailyCost,
      weeklyCost,
      monthlyCost,
      budgetLimits: budgetAlerts,
      utilizationPercentage: {
        daily: (dailyCost / budgetAlerts.dailyLimit) * 100,
        weekly: (weeklyCost / budgetAlerts.weeklyLimit) * 100,
        monthly: (monthlyCost / budgetAlerts.monthlyLimit) * 100,
      },
    };
  },

  /**
   * Set scaling policy for a worker
   */
  setScalingPolicy(workerName: string, policy: ScalingPolicy): void {
    if (!config) {
      throw ErrorFactory.createWorkerError('AutoScaler not initialized');
    }

    config.scalingPolicies.set(workerName, policy);
    Logger.info(`Updated scaling policy for ${workerName}`);
  },

  /**
   * Get scaling policy for a worker
   */
  getScalingPolicy(workerName: string): ScalingPolicy | null {
    if (!config) {
      return null;
    }

    return config.scalingPolicies.get(workerName) ?? null;
  },

  /**
   * Check if currently in off-peak period
   */
  isOffPeak(): boolean {
    if (config?.costOptimization.enabled === undefined) {
      return false;
    }

    return isOffPeakPeriod(config.costOptimization.offPeakSchedule);
  },

  /**
   * Get configuration
   */
  getConfig(): AutoScalerConfig | null {
    return config ? { ...config } : null;
  },

  /**
   * Shutdown
   */
  shutdown(): void {
    AutoScaler.stop();
    config = null;
    lastScalingDecisions.clear();
    scalingHistory.clear();
    Logger.info('AutoScaler shutdown complete');
  },
});

// Graceful shutdown on process termination
process.on('SIGTERM', () => {
  AutoScaler.shutdown();
});

process.on('SIGINT', () => {
  AutoScaler.shutdown();
});
