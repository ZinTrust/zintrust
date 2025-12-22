import { storageConfig } from '@/config/storage';
import { describe, expect, it } from 'vitest';

describe('Storage Config', () => {
  it('should have default driver', () => {
    expect(storageConfig.default).toBeDefined();
  });

  it('should have driver definitions', () => {
    expect(storageConfig.drivers.local).toBeDefined();
    expect(storageConfig.drivers.s3).toBeDefined();
    expect(storageConfig.drivers.gcs).toBeDefined();
  });

  it('should get current driver', () => {
    const driver = storageConfig.getDriver();
    expect(driver).toBeDefined();
    expect(driver.driver).toBeDefined();
  });
});
