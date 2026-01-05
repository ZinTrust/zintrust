import type { BroadcastConfigInput } from '@config/type';

import { BroadcastRegistry } from '@broadcast/BroadcastRegistry';

/**
 * Register broadcasters from runtime config.
 *
 * This follows the framework's config-driven availability pattern:
 * - Every `broadcastConfig.drivers[name]` is registered under `name`.
 * - The configured default name is also registered as `'default'`.
 * - Unknown names throw when selected via `BroadcastRegistry.get(name)`.
 */
export function registerBroadcastersFromRuntimeConfig(
  config: Pick<BroadcastConfigInput, 'default' | 'drivers'>
): void {
  for (const [name, driverConfig] of Object.entries(config.drivers)) {
    BroadcastRegistry.register(name, driverConfig);
  }

  const defaultName = (config.default ?? '').toString().trim().toLowerCase();
  if (defaultName.length === 0) return;

  if (BroadcastRegistry.has(defaultName)) {
    BroadcastRegistry.register('default', BroadcastRegistry.get(defaultName));
  }
}
