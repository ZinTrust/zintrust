import { SQLServerAdapter, type DatabaseConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

type GlobalWithRegistry = {
  __zintrust_db_adapter_registry__?: Map<string, (cfg: unknown) => unknown>;
};

export function registerSqlServerAdapter(registry: Registry): void {
  registry.register('sqlserver', (config) => SQLServerAdapter.create(config as DatabaseConfig));
}

const globalWithRegistry = globalThis as unknown as GlobalWithRegistry;
const globalRegistry =
  globalWithRegistry.__zintrust_db_adapter_registry__ ??
  (globalWithRegistry.__zintrust_db_adapter_registry__ = new Map());

registerSqlServerAdapter({
  register: (driver, factory) => {
    globalRegistry.set(driver, factory);
  },
});

try {
  const core = (await import('@zintrust/core')) as unknown as {
    DatabaseAdapterRegistry?: Registry;
  };

  if (core.DatabaseAdapterRegistry !== undefined) {
    registerSqlServerAdapter(core.DatabaseAdapterRegistry);
  }
} catch {
  // no-op
}
