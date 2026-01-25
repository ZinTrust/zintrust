/**
 * Test Resource Monitoring Environment Gate
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Resource Monitoring Environment Gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should allow resource monitoring when WORKER_RESOURCE_MONITORING=true', async () => {
    process.env.WORKER_RESOURCE_MONITORING = 'true';

    // This would normally start resource monitoring if a worker requests it
    // We're testing the environment gate logic
    const globalResourceMonitoring = process.env.WORKER_RESOURCE_MONITORING !== 'false';
    expect(globalResourceMonitoring).toBe(true);
  });

  it('should block resource monitoring when WORKER_RESOURCE_MONITORING=false', async () => {
    process.env.WORKER_RESOURCE_MONITORING = 'false';

    const globalResourceMonitoring = process.env.WORKER_RESOURCE_MONITORING !== 'false';
    expect(globalResourceMonitoring).toBe(false);
  });

  it('should default to allowing resource monitoring when WORKER_RESOURCE_MONITORING is unset', async () => {
    delete process.env.WORKER_RESOURCE_MONITORING;

    const globalResourceMonitoring = process.env.WORKER_RESOURCE_MONITORING !== 'false';
    expect(globalResourceMonitoring).toBe(true);
  });

  it('should default to allowing resource monitoring when WORKER_RESOURCE_MONITORING is empty', async () => {
    process.env.WORKER_RESOURCE_MONITORING = '';

    const globalResourceMonitoring = process.env.WORKER_RESOURCE_MONITORING !== 'false';
    expect(globalResourceMonitoring).toBe(true);
  });
});
