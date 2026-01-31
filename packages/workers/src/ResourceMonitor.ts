/**
 * Resource Monitor
 * Real-time resource tracking with cost calculation
 * Sealed namespace for immutability
 */

import { Env, Logger, NodeSingletons } from '@zintrust/core';

const getOsModule = (): typeof NodeSingletons.os => NodeSingletons?.os ?? null;

const safeTotalMemory = (): number => {
  const os = getOsModule();
  if (!os?.totalmem) return 0;
  try {
    return os.totalmem();
  } catch {
    return 0;
  }
};

const safeFreeMemory = (): number => {
  const os = getOsModule();
  if (!os?.freemem) return 0;
  try {
    return os.freemem();
  } catch {
    return 0;
  }
};

const safeLoadAverage = (): number[] => {
  const os = getOsModule();
  if (!os?.loadavg) return [0, 0, 0];
  try {
    return os.loadavg();
  } catch {
    return [0, 0, 0];
  }
};

const safeCpuCount = (): number => {
  const os = getOsModule();
  if (!os?.cpus) return 1;
  try {
    return Math.max(1, os.cpus().length);
  } catch {
    return 1;
  }
};

const safePlatform = (): string => {
  const os = getOsModule();
  if (!os?.platform) return 'unknown';
  try {
    return os.platform();
  } catch {
    return 'unknown';
  }
};

const safeArch = (): string => {
  const os = getOsModule();
  if (!os?.arch) return 'unknown';
  try {
    return os.arch();
  } catch {
    return 'unknown';
  }
};

const safeHostname = (): string => {
  const os = getOsModule();
  if (!os?.hostname) return 'unknown';
  try {
    return os.hostname();
  } catch {
    return 'unknown';
  }
};

const safeUptime = (): number => {
  const os = getOsModule();
  if (!os?.uptime) return 0;
  try {
    return os.uptime();
  } catch {
    return 0;
  }
};

export type ResourceSnapshot = {
  timestamp: Date;
  cpu: {
    usage: number; // Percentage 0-100
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    usage: number; // Percentage 0-100
  };
  disk: {
    read: number; // Bytes/sec
    write: number; // Bytes/sec
  };
  network: {
    received: number; // Bytes/sec
    transmitted: number; // Bytes/sec
  };
  process: {
    pid: number;
    uptime: number; // Seconds
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
};

export type WorkerResourceUsage = {
  cpu: number;
  memory: { number: number; percent: number; used: number; free: number };
  cost: { hourly: number; daily: number };
  workerName: string;
  resourceSnapshot: ResourceSnapshot;
  estimatedCost: {
    perHour: number;
    perDay: number;
    perMonth: number;
  };
  efficiency: {
    cpuEfficiency: number; // 0-100, higher is better
    memoryEfficiency: number; // 0-100, higher is better
    overallScore: number; // 0-100
  };
};

export type CostCalculationConfig = {
  computeCostPerCoreHour: number; // USD per core per hour
  memoryCostPerGBHour: number; // USD per GB per hour
  networkCostPerGB: number; // USD per GB transferred
  diskCostPerGB: number; // USD per GB storage
  spotInstanceDiscount: number; // 0-100 percentage discount
};

export type ResourceAlert = {
  timestamp: Date;
  workerName: string;
  alertType: 'cpu-high' | 'memory-high' | 'disk-high' | 'cost-high';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  recommendation?: string;
};

export type ResourceTrend = {
  workerName: string;
  metric: 'cpu' | 'memory' | 'disk' | 'network' | 'cost';
  period: 'hour' | 'day' | 'week';
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercentage: number;
  predictions: {
    nextHour: number;
    nextDay: number;
    nextWeek: number;
  };
};

// Default cost configuration (AWS-like pricing)
const DEFAULT_COST_CONFIG: CostCalculationConfig = {
  computeCostPerCoreHour: 0.0416, // ~$0.0416 per vCPU hour (t3.medium equivalent)
  memoryCostPerGBHour: 0.0052, // ~$0.0052 per GB hour
  networkCostPerGB: 0.09, // $0.09 per GB transferred
  diskCostPerGB: 0.1, // $0.10 per GB/month
  spotInstanceDiscount: 70, // 70% discount for spot instances
};

// Internal state
let costConfig: CostCalculationConfig = { ...DEFAULT_COST_CONFIG };
let monitoringInterval: NodeJS.Timeout | null = null;
const resourceHistory = new Map<string, ResourceSnapshot[]>();
const alertHistory = new Map<string, ResourceAlert[]>();

// Memory management constants
const MAX_HISTORY_SIZE = 1000; // Keep last 1000 snapshots per worker
const MAX_ALERT_HISTORY = 100; // Keep last 100 alerts per worker

// Resource thresholds
const THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 75, critical: 85 },
  disk: { warning: 80, critical: 90 },
  costPerHour: { warning: 10, critical: 50 },
};

/**
 * Helper: Calculate CPU usage percentage
 */
const calculateCpuUsage = (): number => {
  const os = getOsModule();
  if (!os?.cpus) return 0;

  try {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const totalUsed = totalTick - totalIdle;
    const cpuPercentage = (totalUsed / totalTick) * 100;

    return Math.min(100, Math.max(0, cpuPercentage));
  } catch (error) {
    Logger.error('Failed to calculate system CPU usage', error as Error);
    return 0;
  }
};

/**
 * Helper: Get memory usage
 */
const getMemoryUsage = (): ResourceSnapshot['memory'] => {
  const totalMemory = safeTotalMemory();
  const freeMemory = safeFreeMemory();
  const usedMemory = totalMemory - freeMemory;
  const usage = totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0;

  return {
    total: totalMemory,
    used: usedMemory,
    free: freeMemory,
    usage,
  };
};

/**
 * Helper: Capture resource snapshot
 */
const captureSnapshot = (): ResourceSnapshot => {
  const cpuUsage = calculateCpuUsage();
  const memoryUsage = getMemoryUsage();
  const loadAverage = safeLoadAverage();
  const cpuCores = safeCpuCount();

  return {
    timestamp: new Date(),
    cpu: {
      usage: cpuUsage,
      loadAverage,
      cores: cpuCores,
    },
    memory: memoryUsage,
    disk: {
      read: 0, // Would need platform-specific implementation
      write: 0,
    },
    network: {
      received: 0, // Would need platform-specific implementation
      transmitted: 0,
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    },
  };
};

/**
 * Helper: Calculate cost based on resource usage
 */
const calculateCost = (
  snapshot: ResourceSnapshot,
  useSpotDiscount = false
): WorkerResourceUsage['estimatedCost'] => {
  const { cpu, memory } = snapshot;

  // CPU cost (based on cores and usage)
  const cpuCostPerHour = cpu.cores * (cpu.usage / 100) * costConfig.computeCostPerCoreHour;

  // Memory cost (based on GB used)
  const memoryGB = memory.used / (1024 * 1024 * 1024);
  const memoryCostPerHour = memoryGB * costConfig.memoryCostPerGBHour;

  // Total compute cost
  let totalCostPerHour = cpuCostPerHour + memoryCostPerHour;

  // Apply spot instance discount if applicable
  if (useSpotDiscount) {
    totalCostPerHour *= 1 - costConfig.spotInstanceDiscount / 100;
  }

  return {
    perHour: totalCostPerHour,
    perDay: totalCostPerHour * 24,
    perMonth: totalCostPerHour * 24 * 30,
  };
};

/**
 * Helper: Calculate efficiency score
 */
const calculateEfficiency = (snapshot: ResourceSnapshot): WorkerResourceUsage['efficiency'] => {
  const { cpu, memory } = snapshot;

  // CPU efficiency: 50-80% usage is ideal
  let cpuEfficiency: number;
  if (cpu.usage < 30) {
    cpuEfficiency = cpu.usage * 2; // Under-utilized
  } else if (cpu.usage > 80) {
    cpuEfficiency = 100 - (cpu.usage - 80) * 2; // Over-utilized
  } else {
    cpuEfficiency = 100; // Ideal range
  }

  // Memory efficiency: 50-75% usage is ideal
  let memoryEfficiency: number;
  if (memory.usage < 40) {
    memoryEfficiency = memory.usage * 1.5; // Under-utilized
  } else if (memory.usage > 75) {
    memoryEfficiency = 100 - (memory.usage - 75) * 2; // Over-utilized
  } else {
    memoryEfficiency = 100; // Ideal range
  }

  const overallScore = cpuEfficiency * 0.6 + memoryEfficiency * 0.4;

  return {
    cpuEfficiency: Math.round(cpuEfficiency),
    memoryEfficiency: Math.round(memoryEfficiency),
    overallScore: Math.round(overallScore),
  };
};

/**
 * Helper: Check thresholds and create alerts
 */
const checkThresholds = (
  workerName: string,
  snapshot: ResourceSnapshot,
  cost: WorkerResourceUsage['estimatedCost']
): ResourceAlert[] => {
  const alerts: ResourceAlert[] = [];

  // CPU alerts
  if (snapshot.cpu.usage >= THRESHOLDS.cpu.critical) {
    alerts.push({
      timestamp: new Date(),
      workerName,
      alertType: 'cpu-high',
      severity: 'critical',
      message: `Critical CPU usage: ${snapshot.cpu.usage.toFixed(1)}%`,
      currentValue: snapshot.cpu.usage,
      threshold: THRESHOLDS.cpu.critical,
      recommendation: 'Consider scaling up or optimizing worker code',
    });
  } else if (snapshot.cpu.usage >= THRESHOLDS.cpu.warning) {
    alerts.push({
      timestamp: new Date(),
      workerName,
      alertType: 'cpu-high',
      severity: 'warning',
      message: `High CPU usage: ${snapshot.cpu.usage.toFixed(1)}%`,
      currentValue: snapshot.cpu.usage,
      threshold: THRESHOLDS.cpu.warning,
      recommendation: 'Monitor closely and consider scaling',
    });
  }

  // Memory alerts
  if (snapshot.memory.usage >= THRESHOLDS.memory.critical) {
    alerts.push({
      timestamp: new Date(),
      workerName,
      alertType: 'memory-high',
      severity: 'critical',
      message: `Critical memory usage: ${snapshot.memory.usage.toFixed(1)}%`,
      currentValue: snapshot.memory.usage,
      threshold: THRESHOLDS.memory.critical,
      recommendation: 'Increase memory allocation or optimize memory usage',
    });
  } else if (snapshot.memory.usage >= THRESHOLDS.memory.warning) {
    alerts.push({
      timestamp: new Date(),
      workerName,
      alertType: 'memory-high',
      severity: 'warning',
      message: `High memory usage: ${snapshot.memory.usage.toFixed(1)}%`,
      currentValue: snapshot.memory.usage,
      threshold: THRESHOLDS.memory.warning,
      recommendation: 'Monitor memory consumption',
    });
  }

  // Cost alerts
  if (cost.perHour >= THRESHOLDS.costPerHour.critical) {
    alerts.push({
      timestamp: new Date(),
      workerName,
      alertType: 'cost-high',
      severity: 'critical',
      message: `Critical hourly cost: $${cost.perHour.toFixed(2)}/hr`,
      currentValue: cost.perHour,
      threshold: THRESHOLDS.costPerHour.critical,
      recommendation: 'Review resource allocation and consider cost optimization',
    });
  } else if (cost.perHour >= THRESHOLDS.costPerHour.warning) {
    alerts.push({
      timestamp: new Date(),
      workerName,
      alertType: 'cost-high',
      severity: 'warning',
      message: `High hourly cost: $${cost.perHour.toFixed(2)}/hr`,
      currentValue: cost.perHour,
      threshold: THRESHOLDS.costPerHour.warning,
      recommendation: 'Consider using spot instances or reducing concurrency',
    });
  }

  return alerts;
};

/**
 * Helper: Store alert
 */
const storeAlert = (alert: ResourceAlert): void => {
  let history = alertHistory.get(alert.workerName);
  if (!history) {
    history = [];
    alertHistory.set(alert.workerName, history);
  }

  history.push(alert);

  // Trim alert history to prevent memory leaks
  if (history.length > MAX_ALERT_HISTORY) {
    alertHistory.set(alert.workerName, history.slice(-MAX_ALERT_HISTORY));
  }
};

/**
 * Helper: Calculate trend
 */
const calculateTrend = (
  workerName: string,
  metric: ResourceTrend['metric'],
  period: ResourceTrend['period']
): ResourceTrend | null => {
  const history = resourceHistory.get(workerName);
  if (!history || history.length < 2) return null;

  const now = Date.now();
  let periodMs: number;

  switch (period) {
    case 'hour':
      periodMs = 60 * 60 * 1000;
      break;
    case 'day':
      periodMs = 24 * 60 * 60 * 1000;
      break;
    case 'week':
      periodMs = 7 * 24 * 60 * 60 * 1000;
      break;
  }

  // Filter snapshots within period
  const periodSnapshots = history.filter((s) => now - s.timestamp.getTime() <= periodMs);
  if (periodSnapshots.length < 2) return null;

  // Get metric values
  const values = periodSnapshots.map((s) => {
    switch (metric) {
      case 'cpu':
        return s.cpu.usage;
      case 'memory':
        return s.memory.usage;
      case 'disk':
        return s.disk.read + s.disk.write;
      case 'network':
        return s.network.received + s.network.transmitted;
      case 'cost':
        return calculateCost(s).perHour;
    }
  });

  // Simple linear regression for trend
  const firstValue = values[0];
  const lastValue = values.at(-1) ?? values[0];
  const changePercentage = ((lastValue - firstValue) / firstValue) * 100;

  let trend: ResourceTrend['trend'];
  if (Math.abs(changePercentage) < 5) {
    trend = 'stable';
  } else if (changePercentage > 0) {
    trend = 'increasing';
  } else {
    trend = 'decreasing';
  }

  // Simple predictions (linear extrapolation)
  const avgChange = (lastValue - firstValue) / periodSnapshots.length;
  const predictions = {
    nextHour: lastValue + avgChange * 12, // Assuming 5-min intervals
    nextDay: lastValue + avgChange * 288,
    nextWeek: lastValue + avgChange * 2016,
  };

  return {
    workerName,
    metric,
    period,
    trend,
    changePercentage,
    predictions,
  };
};

/**
 * Resource Monitor - Sealed namespace
 */
export const ResourceMonitor = Object.freeze({
  /**
   * Initialize resource monitor
   */
  initialize(config?: Partial<CostCalculationConfig>): void {
    if (config) {
      costConfig = { ...DEFAULT_COST_CONFIG, ...config };
    }

    Logger.info('ResourceMonitor initialized', { costConfig });
  },

  /**
   * Check whether monitoring is running
   */
  isRunning(): boolean {
    return monitoringInterval !== null;
  },

  /**
   * Start monitoring
   */
  start(intervalSeconds = 30): void {
    const globalResourceMonitoring = Env.getBool('WORKER_RESOURCE_MONITORING', false);
    if (!globalResourceMonitoring) {
      Logger.warn('ResourceMonitor disabled (WORKER_RESOURCE_MONITORING=false)');
      return;
    }
    if (monitoringInterval) {
      Logger.warn('ResourceMonitor already running');
      return;
    }

    monitoringInterval = setInterval(() => {
      const snapshot = captureSnapshot();
      // Store snapshot for later analysis
      // This would typically be saved to a time-series database
      Logger.debug('Resource snapshot captured', {
        cpu: snapshot.cpu.usage.toFixed(1) + '%',
        memory: snapshot.memory.usage.toFixed(1) + '%',
      });
    }, intervalSeconds * 1000);

    Logger.info('ResourceMonitor started', { intervalSeconds });
  },

  /**
   * Stop monitoring
   */
  stop(): void {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
      Logger.info('ResourceMonitor stopped');
    }
  },

  /**
   * Get current resource usage
   */
  getCurrentUsage(workerName: string, useSpotDiscount = false): WorkerResourceUsage {
    const snapshot = captureSnapshot();
    const cost = calculateCost(snapshot, useSpotDiscount);
    const efficiency = calculateEfficiency(snapshot);

    // Store in history
    let history = resourceHistory.get(workerName);
    if (!history) {
      history = [];
      resourceHistory.set(workerName, history);
    }

    history.push(snapshot);

    // Trim resource history to prevent memory leaks
    if (history.length > MAX_HISTORY_SIZE) {
      resourceHistory.set(workerName, history.slice(-MAX_HISTORY_SIZE));
    }

    // Check thresholds
    const alerts = checkThresholds(workerName, snapshot, cost);
    alerts.forEach((element) => {
      storeAlert(element);
    });

    return {
      workerName,
      cpu: snapshot.cpu.usage,
      memory: {
        number: snapshot.memory.total,
        percent: snapshot.memory.usage,
        used: snapshot.memory.used,
        free: snapshot.memory.free,
      },
      cost: {
        hourly: cost.perHour,
        daily: cost.perDay,
      },
      resourceSnapshot: snapshot,
      estimatedCost: cost,
      efficiency,
    };
  },

  /**
   * Get resource history
   */
  getHistory(workerName: string, limit = 100): ReadonlyArray<ResourceSnapshot> {
    const history = resourceHistory.get(workerName) ?? [];
    return history.slice(-limit).map((s) => ({ ...s }));
  },

  /**
   * Get alerts
   */
  getAlerts(workerName: string, limit = 100): ReadonlyArray<ResourceAlert> {
    const history = alertHistory.get(workerName) ?? [];
    return history.slice(-limit).map((a) => ({ ...a }));
  },

  /**
   * Get trend analysis
   */
  getTrend(
    workerName: string,
    metric: ResourceTrend['metric'],
    period: ResourceTrend['period']
  ): ResourceTrend | null {
    return calculateTrend(workerName, metric, period);
  },

  /**
   * Get all trends
   */
  getAllTrends(
    workerName: string,
    period: ResourceTrend['period']
  ): Record<ResourceTrend['metric'], ResourceTrend | null> {
    return {
      cpu: calculateTrend(workerName, 'cpu', period),
      memory: calculateTrend(workerName, 'memory', period),
      disk: calculateTrend(workerName, 'disk', period),
      network: calculateTrend(workerName, 'network', period),
      cost: calculateTrend(workerName, 'cost', period),
    };
  },

  /**
   * Update cost configuration
   */
  updateCostConfig(config: Partial<CostCalculationConfig>): void {
    costConfig = { ...costConfig, ...config };
    Logger.info('Resource monitor cost config updated', { costConfig });
  },

  /**
   * Get cost configuration
   */
  getCostConfig(): CostCalculationConfig {
    return { ...costConfig };
  },

  /**
   * Calculate projected cost
   */
  calculateProjectedCost(
    cpuUsagePercent: number,
    memoryGB: number,
    hoursPerDay: number,
    useSpotDiscount = false
  ): { daily: number; monthly: number; yearly: number } {
    const cpuCores = safeCpuCount();
    const cpuCostPerHour = cpuCores * (cpuUsagePercent / 100) * costConfig.computeCostPerCoreHour;
    const memoryCostPerHour = memoryGB * costConfig.memoryCostPerGBHour;

    let totalCostPerHour = cpuCostPerHour + memoryCostPerHour;

    if (useSpotDiscount) {
      totalCostPerHour *= 1 - costConfig.spotInstanceDiscount / 100;
    }

    return {
      daily: totalCostPerHour * hoursPerDay,
      monthly: totalCostPerHour * hoursPerDay * 30,
      yearly: totalCostPerHour * hoursPerDay * 365,
    };
  },

  /**
   * Get system information
   */
  getSystemInfo(): {
    platform: string;
    arch: string;
    hostname: string;
    cpus: number;
    totalMemory: number;
    freeMemory: number;
    uptime: number;
  } {
    return {
      platform: safePlatform(),
      arch: safeArch(),
      hostname: safeHostname(),
      cpus: safeCpuCount(),
      totalMemory: safeTotalMemory(),
      freeMemory: safeFreeMemory(),
      uptime: safeUptime(),
    };
  },

  /**
   * Clear history for a worker
   */
  clearHistory(workerName: string): void {
    resourceHistory.delete(workerName);
    alertHistory.delete(workerName);
    Logger.info(`Cleared resource history for ${workerName}`);
  },

  /**
   * Shutdown
   */
  shutdown(): void {
    ResourceMonitor.stop();
    resourceHistory.clear();
    alertHistory.clear();
    Logger.info('ResourceMonitor shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
