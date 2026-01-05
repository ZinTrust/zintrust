import type { NotificationConfigInput } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
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
  if (defaultName.length === 0) {
    throw ErrorFactory.createConfigError('Notification default channel is not configured');
  }

  if (!NotificationChannelRegistry.has(defaultName)) {
    throw ErrorFactory.createConfigError(
      `Notification default channel not configured: ${defaultName}`
    );
  }

  NotificationChannelRegistry.register('default', NotificationChannelRegistry.get(defaultName));
}

export const NotificationRuntimeRegistration = Object.freeze({
  registerNotificationChannelsFromRuntimeConfig,
});

export default NotificationRuntimeRegistration;
