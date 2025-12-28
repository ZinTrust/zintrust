import { cacheConfig } from '@/config/cache';
import { describe, expect, it } from 'vitest';

describe('Cache Config', () => {
  it('should have default driver', () => {
    expect(cacheConfig.default).toBeDefined();
  });

  it('should have driver definitions', () => {
    expect(cacheConfig.drivers.memory).toBeDefined();
    expect(cacheConfig.drivers.redis).toBeDefined();
    expect(cacheConfig.drivers.mongodb).toBeDefined();
    expect(cacheConfig.drivers.kv).toBeDefined();
  });

  it('should get current driver', () => {
    const driver = cacheConfig.getDriver();
    expect(driver).toBeDefined();
    expect(driver.driver).toBeDefined();
  });
});
