import { D1Adapter, type DatabaseConfig } from './index.js';

type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

export function registerD1Adapter(registry: Registry): void {
  registry.register('d1', (config) => D1Adapter.create(config as DatabaseConfig));
}

const core = (await import('@zintrust/core')) as unknown as {
  DatabaseAdapterRegistry?: Registry;
};

if (core.DatabaseAdapterRegistry !== undefined) {
  registerD1Adapter(core.DatabaseAdapterRegistry);
}
