import { appConfig } from '@/config/app';
import { describe, expect, it } from 'vitest';

describe('App Config', () => {
  it('should have correct properties', () => {
    expect(appConfig.name).toBeDefined();
    expect(appConfig.environment).toBeDefined();
    expect(appConfig.port).toBeDefined();
  });

  it('should check environment correctly', () => {
    // Since appConfig is a const object initialized at load time,
    // we can't easily change environment to test all cases without reloading module.
    // But we can test the logic if we could modify it, or just test current state.

    // However, the methods use `this.environment`.
    // We can try to call the methods bound to a mock object.

    const devConfig = { ...appConfig, environment: 'development' };
    expect(appConfig.isDevelopment.call(devConfig)).toBe(true);
    expect(appConfig.isProduction.call(devConfig)).toBe(false);

    const prodConfig = { ...appConfig, environment: 'production' };
    expect(appConfig.isProduction.call(prodConfig)).toBe(true);
    expect(appConfig.isDevelopment.call(prodConfig)).toBe(false);

    const testConfig = { ...appConfig, environment: 'testing' };
    expect(appConfig.isTesting.call(testConfig)).toBe(true);
  });
});
