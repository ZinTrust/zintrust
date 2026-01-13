import { Env, type NotificationConfigOverrides } from '@zintrust/core';

/**
 * Notification Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 */

export default {
  default: Env.get('NOTIFICATION_CONNECTION', Env.get('NOTIFICATION_DRIVER', 'console')),
  drivers: {
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
  },
} satisfies NotificationConfigOverrides;
