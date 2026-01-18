/**
 * Datacenter Orchestration
 * Multi-datacenter worker coordination with region affinity and failover
 * Sealed namespace for immutability
 */

import { ErrorFactory, Logger } from '@zintrust/core';
import { ClusterLock } from './ClusterLock';

export type DatacenterRegion = {
  id: string;
  name: string;
  location: {
    continent: string;
    country: string;
    city: string;
    coordinates?: { lat: number; lng: number };
  };
  priority: number; // Higher = preferred
  capacity: number; // Max concurrent workers
  currentLoad: number; // Current active workers
  healthStatus: 'healthy' | 'degraded' | 'offline';
  latency: number; // Average latency in ms
  costMultiplier: number; // Relative cost (1.0 = baseline)
};

export type ReplicationStrategy = 'none' | 'active-passive' | 'active-active' | 'multi-master';

export type FailoverPolicy = {
  enabled: boolean;
  autoFailover: boolean;
  failoverThreshold: number; // Error rate threshold (0-1)
  healthCheckInterval: number; // Seconds between health checks
  minHealthyRegions: number; // Minimum regions that must be healthy
  preferredRegions: string[]; // Prefer these regions for failover
};

export type WorkerPlacement = {
  workerName: string;
  primaryRegion: string;
  secondaryRegions: string[];
  replicationStrategy: ReplicationStrategy;
  affinityRules: {
    preferLocal: boolean; // Prefer local region for jobs
    maxLatency?: number; // Max acceptable latency for cross-region
    avoidRegions?: string[]; // Never place in these regions
  };
};

export type DatacenterTopology = {
  regions: DatacenterRegion[];
  connections: Array<{
    from: string;
    to: string;
    latency: number; // ms
    bandwidth: number; // Mbps
  }>;
};

// Internal state
const regions = new Map<string, DatacenterRegion>();
const workerPlacements = new Map<string, WorkerPlacement>();
const failoverPolicies = new Map<string, FailoverPolicy>();
const healthCheckIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Helper: Calculate distance between two coordinates (Haversine formula)
 */
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Helper: Find optimal region for placement
 */
const findOptimalRegion = (placement: WorkerPlacement, clientRegion?: string): string | null => {
  const candidateRegions = [placement.primaryRegion, ...placement.secondaryRegions];
  const healthyRegions = candidateRegions.filter((regionId) => {
    const region = regions.get(regionId);
    return region?.healthStatus === 'healthy' && region.currentLoad < region.capacity;
  });

  if (healthyRegions.length === 0) {
    return null;
  }

  // If client region specified and local preference enabled
  if (
    placement.affinityRules.preferLocal &&
    typeof clientRegion === 'string' &&
    clientRegion.length > 0
  ) {
    if (healthyRegions.includes(clientRegion)) {
      return clientRegion;
    }
  }

  // Sort by priority, then by current load (lower is better)
  healthyRegions.sort((a, b) => {
    const regionA = regions.get(a);
    const regionB = regions.get(b);

    if (!regionA || !regionB) {
      return 0;
    }

    if (regionA.priority !== regionB.priority) {
      return regionB.priority - regionA.priority;
    }

    const loadA = regionA.currentLoad / regionA.capacity;
    const loadB = regionB.currentLoad / regionB.capacity;

    return loadA - loadB;
  });

  return healthyRegions[0];
};

/**
 * Helper: Perform health check for region
 */
const performHealthCheck = async (regionId: string): Promise<void> => {
  const region = regions.get(regionId);

  if (!region) {
    return;
  }

  try {
    // Check if region can acquire lock (indicates healthy Redis connection)
    const lockKey = `health:${regionId}`;
    const acquired = await ClusterLock.acquire({
      lockKey,
      ttl: 5,
      region: regionId,
      userId: regionId,
    });

    if (acquired) {
      await ClusterLock.release(lockKey, regionId);

      // Update health status
      if (region.healthStatus === 'offline') {
        region.healthStatus = 'healthy';
        Logger.info(`Region recovered: ${regionId}`);
      }
    }
  } catch (error) {
    Logger.error(`Health check failed for region: ${regionId}`, error as Error);

    region.healthStatus = 'offline';

    // Trigger failover if enabled
    const policy = failoverPolicies.get(regionId);
    if (policy?.enabled === true && policy.autoFailover) {
      triggerFailover(regionId);
    }
  }
};

/**
 * Helper: Trigger failover from unhealthy region
 */
const triggerFailover = (failedRegionId: string): void => {
  Logger.warn(`Triggering failover from region: ${failedRegionId}`);

  // Find all workers placed in failed region
  const affectedWorkers: string[] = [];

  for (const [workerName, placement] of workerPlacements.entries()) {
    if (placement.primaryRegion === failedRegionId) {
      affectedWorkers.push(workerName);
    }
  }

  // Reassign workers to healthy regions
  for (const workerName of affectedWorkers) {
    const placement = workerPlacements.get(workerName);
    if (!placement) {
      continue;
    }
    const newRegion = findOptimalRegion(placement);

    if (newRegion === null) {
      Logger.error(`Failover failed: No healthy region available for worker`, {
        workerName,
        failedRegion: failedRegionId,
      });
      continue;
    }

    Logger.info(`Failover: Moving worker from ${failedRegionId} to ${newRegion}`, {
      workerName,
    });

    // Update placement (would trigger actual worker migration in real implementation)
    placement.primaryRegion = newRegion;
  }
};

/**
 * Datacenter Orchestrator - Sealed namespace
 */
export const DatacenterOrchestrator = Object.freeze({
  /**
   * Register datacenter region
   */
  registerRegion(region: DatacenterRegion): void {
    if (regions.has(region.id)) {
      throw ErrorFactory.createConfigError(`Region "${region.id}" already registered`);
    }

    regions.set(region.id, { ...region });

    Logger.info(`Datacenter region registered: ${region.id}`, {
      location: `${region.location.city}, ${region.location.country}`,
      capacity: region.capacity,
    });
  },

  /**
   * Unregister datacenter region
   */
  unregisterRegion(regionId: string): void {
    const region = regions.get(regionId);

    if (!region) {
      throw ErrorFactory.createNotFoundError(`Region "${regionId}" not found`);
    }

    // Check if any workers are still placed in this region
    const hasWorkers = Array.from(workerPlacements.values()).some(
      (p) => p.primaryRegion === regionId || p.secondaryRegions.includes(regionId)
    );

    if (hasWorkers) {
      throw ErrorFactory.createValidationError(
        `Cannot unregister region with active workers: ${regionId}`
      );
    }

    regions.delete(regionId);

    // Stop health checks
    const interval = healthCheckIntervals.get(regionId);
    if (interval) {
      clearInterval(interval);
      healthCheckIntervals.delete(regionId);
    }

    Logger.info(`Datacenter region unregistered: ${regionId}`);
  },

  /**
   * Get region information
   */
  getRegion(regionId: string): DatacenterRegion | null {
    const region = regions.get(regionId);
    return region ? { ...region } : null;
  },

  /**
   * List all regions
   */
  listRegions(healthStatus?: DatacenterRegion['healthStatus']): ReadonlyArray<DatacenterRegion> {
    const allRegions = Array.from(regions.values());

    if (healthStatus) {
      return allRegions.filter((r) => r.healthStatus === healthStatus);
    }

    return allRegions;
  },

  /**
   * Update region health status
   */
  updateRegionHealth(regionId: string, healthStatus: DatacenterRegion['healthStatus']): void {
    const region = regions.get(regionId);

    if (!region) {
      throw ErrorFactory.createNotFoundError(`Region "${regionId}" not found`);
    }

    const oldStatus = region.healthStatus;
    region.healthStatus = healthStatus;

    Logger.info(`Region health updated: ${regionId}`, {
      oldStatus,
      newStatus: healthStatus,
    });

    // Trigger failover if region went offline
    if (healthStatus === 'offline' && oldStatus !== 'offline') {
      const policy = failoverPolicies.get(regionId);
      if (policy?.enabled === true && policy.autoFailover) {
        triggerFailover(regionId);
      }
    }
  },

  /**
   * Update region load
   */
  updateRegionLoad(regionId: string, currentLoad: number): void {
    const region = regions.get(regionId);

    if (!region) {
      throw ErrorFactory.createNotFoundError(`Region "${regionId}" not found`);
    }

    region.currentLoad = currentLoad;

    // Check if region is overloaded
    if (currentLoad > region.capacity * 0.9) {
      Logger.warn(`Region approaching capacity: ${regionId}`, {
        currentLoad,
        capacity: region.capacity,
      });

      region.healthStatus = 'degraded';
    } else if (region.healthStatus === 'degraded' && currentLoad < region.capacity * 0.7) {
      region.healthStatus = 'healthy';
    }
  },

  /**
   * Place worker in datacenter
   */
  placeWorker(placement: WorkerPlacement): void {
    if (workerPlacements.has(placement.workerName)) {
      throw ErrorFactory.createConfigError(
        `Worker "${placement.workerName}" already has a placement`
      );
    }

    // Validate regions exist
    const allRegions = [placement.primaryRegion, ...placement.secondaryRegions];
    for (const regionId of allRegions) {
      if (!regions.has(regionId)) {
        throw ErrorFactory.createNotFoundError(`Region "${regionId}" not found`);
      }
    }

    workerPlacements.set(placement.workerName, { ...placement });

    Logger.info(`Worker placed in datacenter: ${placement.workerName}`, {
      primaryRegion: placement.primaryRegion,
      secondaryRegions: placement.secondaryRegions,
    });
  },

  /**
   * Get worker placement
   */
  getPlacement(workerName: string): WorkerPlacement | null {
    const placement = workerPlacements.get(workerName);
    return placement ? { ...placement } : null;
  },

  /**
   * Update worker placement
   */
  updatePlacement(workerName: string, updates: Partial<WorkerPlacement>): void {
    const placement = workerPlacements.get(workerName);

    if (!placement) {
      throw ErrorFactory.createNotFoundError(`Placement not found for worker "${workerName}"`);
    }

    Object.assign(placement, updates);

    Logger.info(`Worker placement updated: ${workerName}`);
  },

  /**
   * Remove worker placement
   */
  removeWorker(workerName: string): void {
    if (!workerPlacements.has(workerName)) {
      return;
    }

    workerPlacements.delete(workerName);

    Logger.info(`Worker placement removed: ${workerName}`);
  },

  /**
   * Find optimal region for job execution
   */
  findOptimalRegion(workerName: string, clientRegion?: string): string | null {
    const placement = workerPlacements.get(workerName);

    if (!placement) {
      throw ErrorFactory.createNotFoundError(`Placement not found for worker "${workerName}"`);
    }

    return findOptimalRegion(placement, clientRegion);
  },

  /**
   * Set failover policy for region
   */
  setFailoverPolicy(regionId: string, policy: FailoverPolicy): void {
    const region = regions.get(regionId);

    if (!region) {
      throw ErrorFactory.createNotFoundError(`Region "${regionId}" not found`);
    }

    failoverPolicies.set(regionId, { ...policy });

    // Start health checks if enabled
    if (policy.enabled) {
      DatacenterOrchestrator.startHealthChecks(regionId, policy.healthCheckInterval);
    }

    Logger.info(`Failover policy set for region: ${regionId}`, {
      autoFailover: policy.autoFailover,
    });
  },

  /**
   * Get failover policy
   */
  getFailoverPolicy(regionId: string): FailoverPolicy | null {
    const policy = failoverPolicies.get(regionId);
    return policy ? { ...policy } : null;
  },

  /**
   * Start health checks for region
   */
  startHealthChecks(regionId: string, intervalSeconds: number): void {
    // Clear existing interval
    const existing = healthCheckIntervals.get(regionId);
    if (existing) {
      clearInterval(existing);
    }

    // Start new interval
    const interval = setInterval(() => {
      performHealthCheck(regionId);
    }, intervalSeconds * 1000);

    healthCheckIntervals.set(regionId, interval);

    Logger.info(`Health checks started for region: ${regionId}`, {
      interval: intervalSeconds,
    });
  },

  /**
   * Stop health checks for region
   */
  stopHealthChecks(regionId: string): void {
    const interval = healthCheckIntervals.get(regionId);

    if (interval) {
      clearInterval(interval);
      healthCheckIntervals.delete(regionId);

      Logger.info(`Health checks stopped for region: ${regionId}`);
    }
  },

  /**
   * Get datacenter topology
   */
  getTopology(): DatacenterTopology {
    const regionList = Array.from(regions.values());
    const connections: DatacenterTopology['connections'] = [];

    // Calculate latencies between regions based on distance
    for (let i = 0; i < regionList.length; i++) {
      for (let j = i + 1; j < regionList.length; j++) {
        const from = regionList[i];
        const to = regionList[j];

        if (from.location.coordinates && to.location.coordinates) {
          const distance = calculateDistance(
            from.location.coordinates.lat,
            from.location.coordinates.lng,
            to.location.coordinates.lat,
            to.location.coordinates.lng
          );

          // Rough estimate: 1ms per 100km + base latency
          const latency = Math.round(distance / 100) + 10;

          connections.push({
            from: from.id,
            to: to.id,
            latency,
            bandwidth: 10000, // 10 Gbps default
          });
        }
      }
    }

    return {
      regions: regionList,
      connections,
    };
  },

  /**
   * Get load balancing recommendation
   */
  getLoadBalancingRecommendation(): Array<{ regionId: string; recommendedLoad: number }> {
    const regionList = Array.from(regions.values()).filter((r) => r.healthStatus === 'healthy');

    const totalCapacity = regionList.reduce((sum, r) => sum + r.capacity, 0);

    return regionList.map((region) => {
      const idealLoad = (region.capacity / totalCapacity) * 100;
      const currentLoadPercent = (region.currentLoad / region.capacity) * 100;
      const recommendedAdjustment = idealLoad - currentLoadPercent;

      return {
        regionId: region.id,
        recommendedLoad: Math.max(0, region.currentLoad + recommendedAdjustment),
      };
    });
  },

  /**
   * Shutdown datacenter orchestrator
   */
  shutdown(): void {
    Logger.info('DatacenterOrchestrator shutting down...');

    // Stop all health checks
    for (const interval of healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    healthCheckIntervals.clear();

    regions.clear();
    workerPlacements.clear();
    failoverPolicies.clear();

    Logger.info('DatacenterOrchestrator shutdown complete');
  },
});

// Graceful shutdown handled by WorkerShutdown
