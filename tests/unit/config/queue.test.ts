import { queueConfig } from '@/config/queue';
import { describe, expect, it } from 'vitest';

describe('Queue Config', () => {
  it('should have default driver', () => {
    expect(queueConfig.default).toBeDefined();
  });

  it('should have driver definitions', () => {
    expect(queueConfig.drivers.sync).toBeDefined();
    expect(queueConfig.drivers.database).toBeDefined();
    expect(queueConfig.drivers.redis).toBeDefined();
    expect(queueConfig.drivers.rabbitmq).toBeDefined();
    expect(queueConfig.drivers.sqs).toBeDefined();
  });

  it('should get current driver', () => {
    const driver = queueConfig.getDriver();
    expect(driver).toBeDefined();
    expect(driver.driver).toBeDefined();
  });
});
