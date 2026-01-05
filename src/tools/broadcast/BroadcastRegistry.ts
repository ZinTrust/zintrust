import type { KnownBroadcastDriverConfig } from '@config/type';

import { ErrorFactory } from '@exceptions/ZintrustError';

const registry = new Map<string, KnownBroadcastDriverConfig>();

const normalize = (value: string): string => value.trim().toLowerCase();

function register(name: string, config: KnownBroadcastDriverConfig): void {
  registry.set(normalize(name), config);
}

function get(name: string): KnownBroadcastDriverConfig {
  const key = normalize(name);
  const found = registry.get(key);
  if (found !== undefined) return found;
  throw ErrorFactory.createConfigError(`Broadcast driver not configured: ${key}`);
}

function has(name: string): boolean {
  return registry.has(normalize(name));
}

function list(): string[] {
  return Array.from(registry.keys());
}

function reset(): void {
  registry.clear();
}

export const BroadcastRegistry = Object.freeze({
  register,
  get,
  has,
  list,
  reset,
});
