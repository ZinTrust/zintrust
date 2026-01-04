import { SQLiteAdapter, type DatabaseConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerSqliteAdapter(registry: Registry): void {
  registry.register('sqlite', (config) => SQLiteAdapter.create(config as DatabaseConfig));
}

const core = (await import('@zintrust/core')) as unknown as {
  DatabaseAdapterRegistry?: Registry;
};

if (core.DatabaseAdapterRegistry !== undefined) {
  registerSqliteAdapter(core.DatabaseAdapterRegistry);
}
