import { PostgreSQLAdapter, type DatabaseConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerPostgresAdapter(registry: Registry): void {
  registry.register('postgresql', (config) => PostgreSQLAdapter.create(config as DatabaseConfig));
}

const core = (await import('@zintrust/core')) as unknown as {
  DatabaseAdapterRegistry?: Registry;
};

if (core.DatabaseAdapterRegistry !== undefined) {
  registerPostgresAdapter(core.DatabaseAdapterRegistry);
}
