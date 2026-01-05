import { ErrorFactory } from '@exceptions/ZintrustError';

const registry = new Map<string, unknown>();

const normalizeKey = (name: string): string =>
  String(name ?? '')
    .trim()
    .toLowerCase();

function register(name: string, config: unknown): void {
  const key = normalizeKey(name);
  if (key === '') return;
  registry.set(key, config);
}

function has(name: string): boolean {
  return registry.has(normalizeKey(name));
}

function get(name: string): unknown {
  const key = normalizeKey(name);
  const cfg = registry.get(key);
  if (cfg === undefined) {
    throw ErrorFactory.createConfigError(`Storage disk not registered: ${name}`);
  }
  return cfg;
}

function list(): string[] {
  return Array.from(registry.keys()).sort((a, b) => a.localeCompare(b));
}

function reset(): void {
  registry.clear();
}

export const StorageDiskRegistry = Object.freeze({
  register,
  has,
  get,
  list,
  reset,
});

export default StorageDiskRegistry;
