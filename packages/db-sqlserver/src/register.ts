import { SQLServerAdapter, type DatabaseConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerSqlServerAdapter(registry: Registry): void {
  registry.register('sqlserver', (config) => SQLServerAdapter.create(config as DatabaseConfig));
}

const core = (await import('@zintrust/core')) as unknown as {
  DatabaseAdapterRegistry?: Registry;
};

if (core.DatabaseAdapterRegistry !== undefined) {
  registerSqlServerAdapter(core.DatabaseAdapterRegistry);
}
