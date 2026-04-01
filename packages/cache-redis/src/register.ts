import { RedisCacheDriver, type RedisCacheConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerRedisCacheDriver(registry: Registry): void {
  registry.register('redis', (config) => RedisCacheDriver.create(config as RedisCacheConfig));
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@zintrust/core');
  } catch {
    return {};
  }
};

const core = (await importCore()) as unknown as {
  CacheDriverRegistry?: Registry;
};

if (typeof core.CacheDriverRegistry?.register === 'function') {
  registerRedisCacheDriver(core.CacheDriverRegistry);
}
