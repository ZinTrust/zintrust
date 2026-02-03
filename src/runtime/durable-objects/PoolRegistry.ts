import type { PoolDriver } from '@/runtime/durable-objects/PoolDriver';

const registry = new Map<string, PoolDriver>();

const register = (driver: PoolDriver): void => {
  registry.set(driver.name, driver);
};

const get = (name: string): PoolDriver | undefined => registry.get(name);

const list = (): string[] => Array.from(registry.keys());

export const PoolRegistry = Object.freeze({
  register,
  get,
  list,
});
