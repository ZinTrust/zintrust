import type { CacheDriver } from '@cache/CacheDriver';
import type { CacheDriverConfig } from '@config/type';

export type CacheDriverFactory = (config: CacheDriverConfig) => CacheDriver;

const registry = new Map<CacheDriverConfig['driver'], CacheDriverFactory>();

function register(driver: CacheDriverConfig['driver'], factory: CacheDriverFactory): void {
  registry.set(driver, factory);
}

function get(driver: CacheDriverConfig['driver']): CacheDriverFactory | undefined {
  return registry.get(driver);
}

function has(driver: CacheDriverConfig['driver']): boolean {
  return registry.has(driver);
}

function list(): Array<CacheDriverConfig['driver']> {
  return Array.from(registry.keys());
}

export const CacheDriverRegistry = Object.freeze({
  register,
  get,
  has,
  list,
});
