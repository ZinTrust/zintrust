export type StorageDriverEntry = {
  driver: unknown;
  normalize?: (raw: Record<string, unknown>) => Record<string, unknown>;
};

const registry = new Map<string, StorageDriverEntry>();

function register(driverName: string, entry: StorageDriverEntry): void {
  registry.set(String(driverName).trim().toLowerCase(), entry);
}

function get(driverName: string): StorageDriverEntry | undefined {
  return registry.get(String(driverName).trim().toLowerCase());
}

function has(driverName: string): boolean {
  return registry.has(String(driverName).trim().toLowerCase());
}

function list(): string[] {
  return Array.from(registry.keys()).sort((a, b) => a.localeCompare(b));
}

export const StorageDriverRegistry = Object.freeze({
  register,
  get,
  has,
  list,
});

export default StorageDriverRegistry;
