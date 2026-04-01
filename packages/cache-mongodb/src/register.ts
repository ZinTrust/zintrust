import { MongoCacheDriver, type MongoCacheConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerMongoCacheDriver(registry: Registry): void {
  registry.register('mongodb', (config) => MongoCacheDriver.create(config as MongoCacheConfig));
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@zintrust/core');
  } catch {
    return {};
  }
};

const core = (await importCore()) as {
  CacheDriverRegistry?: Registry;
};

if (typeof core.CacheDriverRegistry?.register === 'function') {
  registerMongoCacheDriver(core.CacheDriverRegistry);
}
