import type { DatabaseConfig, IDatabaseAdapter } from '@orm/DatabaseAdapter';

export type AdapterFactory = (config: DatabaseConfig) => IDatabaseAdapter;

const registry = new Map<DatabaseConfig['driver'], AdapterFactory>();

function register(driver: DatabaseConfig['driver'], factory: AdapterFactory): void {
  registry.set(driver, factory);
}

function get(driver: DatabaseConfig['driver']): AdapterFactory | undefined {
  return registry.get(driver);
}

function has(driver: DatabaseConfig['driver']): boolean {
  return registry.has(driver);
}

function list(): Array<DatabaseConfig['driver']> {
  return Array.from(registry.keys());
}

export const DatabaseAdapterRegistry = Object.freeze({
  register,
  get,
  has,
  list,
});
