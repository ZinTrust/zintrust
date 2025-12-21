import { cacheConfig } from '@/config/cache';
import { describe, expect, it } from 'vitest';

describe('Cache Config', () => {
  it('should have default driver', () => {
    expect(cacheConfig.default).toBeDefined();
  });

  it('should have driver definitions', () => {
    expect(cacheConfig.drivers.memory).toBeDefined();
    expect(cacheConfig.drivers.redis).toBeDefined();
    expect(cacheConfig.drivers.memcached).toBeDefined();
    expect(cacheConfig.drivers.file).toBeDefined();
  });

  it('should get current driver', () => {
    const driver = cacheConfig.getDriver();
    expect(driver).toBeDefined();
    expect(driver.driver).toBeDefined();
  });
});
