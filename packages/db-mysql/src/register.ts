import { MySQLAdapter, type DatabaseConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerMySqlAdapter(registry: Registry): void {
  registry.register('mysql', (config) => MySQLAdapter.create(config as DatabaseConfig));
}

const core = (await import('@zintrust/core')) as unknown as {
  DatabaseAdapterRegistry?: Registry;
};

if (core.DatabaseAdapterRegistry !== undefined) {
  registerMySqlAdapter(core.DatabaseAdapterRegistry);
}
