import type { KnownNotificationDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';

const registry = new Map<string, KnownNotificationDriverConfig>();

const normalizeKey = (name: string): string =>
  String(name ?? '')
    .trim()
    .toLowerCase();

function register(name: string, config: KnownNotificationDriverConfig): void {
  const key = normalizeKey(name);
  if (key === '') return;
  registry.set(key, config);
}

function has(name: string): boolean {
  return registry.has(normalizeKey(name));
}

function get(name: string): KnownNotificationDriverConfig {
  const key = normalizeKey(name);
  const cfg = registry.get(key);
  if (cfg === undefined) {
    throw ErrorFactory.createConfigError(`Notification channel not registered: ${name}`);
  }
  return cfg;
}

function list(): string[] {
  return Array.from(registry.keys()).sort((a, b) => a.localeCompare(b));
}

function reset(): void {
  registry.clear();
}

export const NotificationChannelRegistry = Object.freeze({
  register,
  has,
  get,
  list,
  reset,
});

export default NotificationChannelRegistry;
