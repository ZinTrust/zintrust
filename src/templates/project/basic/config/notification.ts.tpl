/**
 * Notification Configuration
 *
 * Config-first mapping of notification providers.
 * Keeps runtime driver selection in one place and uses Env for safe access.
 */

import { Env } from '@zintrust/core';

export type KnownNotificationDriverName = 'console' | 'termii' | 'twilio' | 'slack';

export type ConsoleNotificationDriverConfig = { driver: 'console' };

export type TermiiNotificationDriverConfig = {
  driver: 'termii';
  apiKey: string;
  sender: string;
  endpoint: string;
};

export type TwilioNotificationDriverConfig = {
  driver: 'twilio';
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export type SlackNotificationDriverConfig = {
  driver: 'slack';
  webhookUrl: string;
};

export type KnownNotificationDriverConfig =
  | ConsoleNotificationDriverConfig
  | TermiiNotificationDriverConfig
  | TwilioNotificationDriverConfig
  | SlackNotificationDriverConfig;

type NotificationProviders = {
  console: ConsoleNotificationDriverConfig;
  termii: TermiiNotificationDriverConfig;
  twilio: TwilioNotificationDriverConfig;
  slack: SlackNotificationDriverConfig;
};

const notificationConfigObj = {
  /**
   * Normalized notification driver name.
   *
   * NOTE: This intentionally supports custom driver names (e.g. project-specific drivers),
   * so it returns a string rather than a strict union.
   */
  getDriverName(): string {
    return Env.get('NOTIFICATION_DRIVER', 'console').trim().toLowerCase();
  },

  /**
   * Provider configs.
   */
  providers: {
    console: {
      driver: 'console' as const,
    },

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
  } satisfies NotificationProviders,
} as const;

export default Object.freeze(notificationConfigObj);
