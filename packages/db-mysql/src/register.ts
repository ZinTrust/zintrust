type Registry = {
  register: (driver: string, factory: (cfg: unknown) => unknown) => void;
};

type AdapterModule = {
  MySQLAdapter: { create: (config: unknown) => unknown };
};

// Prefer production build output shape first.
// Dev (tsx) fallback when running directly from src.
const adapterModule = (await (async (): Promise<AdapterModule> => {
  try {
    return (await import('./index.js')) as unknown as AdapterModule;
  } catch {
    return (await import('./index')) as unknown as AdapterModule;
  }
})()) satisfies AdapterModule;

export function registerMySqlAdapter(registry: Registry): void {
  registry.register('mysql', (config) => adapterModule.MySQLAdapter.create(config));
}

// Always register into the shared global registry used by ZinTrust core.
// This makes `import 'packages/db-mysql/src/register'` sufficient in monorepo/dev.
type GlobalWithRegistry = {
  __zintrust_db_adapter_registry__?: Map<string, (cfg: unknown) => unknown>;
};

const globalWithRegistry = globalThis as unknown as GlobalWithRegistry;
const globalRegistry =
  globalWithRegistry.__zintrust_db_adapter_registry__ ??
  (globalWithRegistry.__zintrust_db_adapter_registry__ = new Map());

registerMySqlAdapter({
  register: (driver, factory) => {
    globalRegistry.set(driver, factory);
  },
});

// Side-effect registration when used as a published package.
// In monorepo/dev setups, @zintrust/core may not be resolvable; ignore if missing.
try {
  const core = (await import('@zintrust/core')) as unknown as {
    DatabaseAdapterRegistry?: Registry;
  };

  if (core.DatabaseAdapterRegistry !== undefined) {
    registerMySqlAdapter(core.DatabaseAdapterRegistry);
  }
} catch {
  // no-op
}
