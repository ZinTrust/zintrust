/**
 * Notification Configuration
 *
 * Config-first mapping of notification providers/channels.
 * Driver selection must be dynamic (tests may mutate process.env).
 */

import { Env } from '@config/env';
import type {
  KnownNotificationDriverConfig,
  NotificationConfigInput,
  NotificationDrivers,
  NotificationProviders,
} from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';

const normalizeName = (value: string): string => value.trim().toLowerCase();

const hasOwn = (obj: Record<string, unknown>, key: string): boolean => {
  return Object.hasOwn(obj, key);
};

const getDefaultChannel = (drivers: NotificationDrivers): string => {
  const envSelectedRaw = Env.get(
    'NOTIFICATION_CONNECTION',
    Env.get('NOTIFICATION_DRIVER', 'console')
  );
  const value = normalizeName(envSelectedRaw ?? 'console');

  if (value.length > 0 && hasOwn(drivers, value)) return value;

  if (envSelectedRaw.trim().length > 0) {
    throw ErrorFactory.createConfigError(`Notification channel not configured: ${value}`);
  }

  return hasOwn(drivers, 'console') ? 'console' : (Object.keys(drivers)[0] ?? 'console');
};

const getNotificationDriver = (
  config: NotificationConfigInput,
  name?: string
): KnownNotificationDriverConfig => {
  const selected = normalizeName(String(name ?? config.default));
  const channelName = selected === 'default' ? normalizeName(config.default) : selected;

  const isExplicitSelection =
    name !== undefined &&
    String(name).trim().length > 0 &&
    normalizeName(String(name)) !== 'default';

  if (channelName.length > 0 && hasOwn(config.drivers, channelName)) {
    const resolved = config.drivers[channelName];
    if (resolved !== undefined) return resolved;
  }

  if (Object.keys(config.drivers ?? {}).length === 0) {
    throw ErrorFactory.createConfigError('No notification channels are configured');
  }

  if (isExplicitSelection) {
    throw ErrorFactory.createConfigError(`Notification channel not configured: ${channelName}`);
  }

  // Default selection is strict: if `default` points at an unconfigured channel, throw.
  throw ErrorFactory.createConfigError(`Notification channel not configured: ${channelName}`);
};

const getBaseProviders = (): NotificationProviders => {
  return {
    console: { driver: 'console' as const },
    termii: {
      driver: 'termii' as const,
      apiKey: Env.get('TERMII_API_KEY', ''),
      sender: Env.get('TERMII_SENDER', 'Zintrust'),
      endpoint: Env.get('TERMII_ENDPOINT', 'https://api.termii.com/sms/send'),
    },
    twilio: {
      driver: 'twilio' as const,
      accountSid: Env.get('TWILIO_ACCOUNT_SID', ''),
      authToken: Env.get('TWILIO_AUTH_TOKEN', ''),
      fromNumber: Env.get('TWILIO_FROM_NUMBER', ''),
    },
    slack: {
      driver: 'slack' as const,
      webhookUrl: Env.get('SLACK_WEBHOOK_URL', ''),
    },
  };
};

const notificationConfigObj = {
  /**
   * Default notification channel name (normalized).
   */
  get default(): string {
    return getDefaultChannel(this.drivers);
  },

  /**
   * Notification channels.
   *
   * You may add custom named channels (e.g. `opsSlack`, `smsMarketing`) that
   * point to any known driver config.
   */
  get drivers(): NotificationDrivers {
    // Return a record of channels; can be extended by app-level config.
    return getBaseProviders() as unknown as NotificationDrivers;
  },

  /**
   * Legacy provider configs (kept for backwards compatibility with wrappers).
   */
  get providers(): NotificationProviders {
    return getBaseProviders();
  },

  /**
   * Normalized notification channel name.
   */
  getDriverName(): string {
    return normalizeName(this.default);
  },

  /**
   * Resolve a channel config.
   * - Unknown names throw when explicitly selected.
   * - `default` is a reserved alias of the configured default.
   */
  getDriverConfig(name?: string): KnownNotificationDriverConfig {
    return getNotificationDriver(this, name);
  },
} as const;

export const notificationConfig = Object.freeze(notificationConfigObj);
export type NotificationConfig = typeof notificationConfig;

export default notificationConfig;
