import type { NotificationConfigInput } from '@config/type';
import { NotificationChannelRegistry } from '@notification/NotificationChannelRegistry';

/**
 * Register notification channels from runtime config.
 *
 * - Every `notificationConfig.drivers[name]` is registered under `name`.
 * - The configured default is also registered as `default`.
 */
export function registerNotificationChannelsFromRuntimeConfig(
  config: Pick<NotificationConfigInput, 'default' | 'drivers'>
): void {
  for (const [name, driverConfig] of Object.entries(config.drivers)) {
    NotificationChannelRegistry.register(name, driverConfig);
  }

  const defaultName = (config.default ?? '').toString().trim().toLowerCase();
  if (defaultName.length === 0) return;

  if (NotificationChannelRegistry.has(defaultName)) {
    NotificationChannelRegistry.register('default', NotificationChannelRegistry.get(defaultName));
  }
}

export const NotificationRuntimeRegistration = Object.freeze({
  registerNotificationChannelsFromRuntimeConfig,
});

export default NotificationRuntimeRegistration;
