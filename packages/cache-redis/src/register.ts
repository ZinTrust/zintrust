import { RedisCacheDriver, type RedisCacheConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerRedisCacheDriver(registry: Registry): void {
  registry.register('redis', (config) => RedisCacheDriver.create(config as RedisCacheConfig));
}

const core = (await import('@zintrust/core')) as unknown as {
  CacheDriverRegistry?: Registry;
};

if (core.CacheDriverRegistry !== undefined) {
  registerRedisCacheDriver(core.CacheDriverRegistry);
}
