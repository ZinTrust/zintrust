import { afterEach, describe, expect, it } from 'vitest';

import { ResourceMonitor } from '../../src/ResourceMonitor';

const getExpectedProjectedCost = (
  cpuUsagePercent: number,
  memoryGB: number,
  hoursPerDay: number,
  spotDiscount = false
): { daily: number; monthly: number; yearly: number } => {
  const costConfig = ResourceMonitor.getCostConfig();
  const cpuCores = ResourceMonitor.getSystemInfo().cpus;
  const cpuCostPerHour = cpuCores * (cpuUsagePercent / 100) * costConfig.computeCostPerCoreHour;
  const memoryCostPerHour = memoryGB * costConfig.memoryCostPerGBHour;
  let totalCostPerHour = cpuCostPerHour + memoryCostPerHour;

  if (spotDiscount) {
    totalCostPerHour *= 1 - costConfig.spotInstanceDiscount / 100;
  }

  return {
    daily: totalCostPerHour * hoursPerDay,
    monthly: totalCostPerHour * hoursPerDay * 30,
    yearly: totalCostPerHour * hoursPerDay * 365,
  };
};

describe('ResourceMonitor', () => {
  const originalConfig = ResourceMonitor.getCostConfig();

  afterEach(() => {
    ResourceMonitor.updateCostConfig(originalConfig);
  });

  it('returns a defensive copy of cost config', () => {
    const config = ResourceMonitor.getCostConfig();
    config.computeCostPerCoreHour = 999;
    const next = ResourceMonitor.getCostConfig();
    expect(next.computeCostPerCoreHour).not.toBe(999);
  });

  it('updates cost config values', () => {
    ResourceMonitor.updateCostConfig({ computeCostPerCoreHour: 0.5 });
    const updated = ResourceMonitor.getCostConfig();
    expect(updated.computeCostPerCoreHour).toBe(0.5);
  });

  it('calculates projected cost deterministically', () => {
    const expected = getExpectedProjectedCost(50, 4, 24, false);
    const projected = ResourceMonitor.calculateProjectedCost(50, 4, 24, false);

    expect(projected.daily).toBeCloseTo(expected.daily, 6);
    expect(projected.monthly).toBeCloseTo(expected.monthly, 6);
    expect(projected.yearly).toBeCloseTo(expected.yearly, 6);
  });
});
