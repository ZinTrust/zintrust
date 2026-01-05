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

  it('throws when default driver is unknown (no fallback)', () => {
    const fakeConfig: any = { default: 'nope', drivers: cacheConfig.drivers };
    expect(() => cacheConfig.getDriver.call(fakeConfig as any)).toThrow(
      /Cache default store not configured/i
    );
  });

  it('resolves redis driver when default set to redis', () => {
    const fakeConfig: any = { default: 'redis', drivers: cacheConfig.drivers };
    const driver = cacheConfig.getDriver.call(fakeConfig as any);
    expect(driver.driver).toBe('redis');
  });

  it('throws when explicitly selecting an unknown store', () => {
    expect(() => cacheConfig.getDriver('nope' as any)).toThrow(/Cache store not configured/);
  });

  it("treats 'default' as an alias of the configured default", () => {
    const driver = cacheConfig.getDriver();
    const defaultAlias = cacheConfig.getDriver('default');
    expect(defaultAlias.driver).toBe(driver.driver);
  });
});
