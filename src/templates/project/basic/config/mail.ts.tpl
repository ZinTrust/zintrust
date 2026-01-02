/**
 * Mail Configuration
 * Runtime mail drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';
import type { MailConfigInput, MailDriverConfig, MailDriverName, MailDrivers } from '@config/type';

const getMailDriver = (config: MailConfigInput): MailDriverConfig => {
  const defaultDriver = config.default;

  if (Object.hasOwn(config.drivers, defaultDriver)) {
    const driverName = defaultDriver as keyof MailDrivers;
    return config.drivers[driverName];
  }

  return config.drivers.disabled;
};

const mailConfigObj = {
  /**
   * Default mail driver
   */
  default: (Env.get('MAIL_DRIVER', 'disabled') as MailDriverName) ?? 'disabled',

  /**
   * Default "From" identity
   */
  from: {
    address: Env.get('MAIL_FROM_ADDRESS', ''),
    name: Env.get('MAIL_FROM_NAME', ''),
  },

  /**
   * Driver configs
   */
  drivers: {
    disabled: {
      driver: 'disabled' as const,
    },

    sendgrid: {
      driver: 'sendgrid' as const,
      apiKey: Env.get('SENDGRID_API_KEY', ''),
    },

    mailgun: {
      driver: 'mailgun' as const,
      apiKey: Env.get('MAILGUN_API_KEY', ''),
      domain: Env.get('MAILGUN_DOMAIN', ''),
      baseUrl: Env.get('MAILGUN_BASE_URL', 'https://api.mailgun.net').trim(),
    },

    smtp: {
      driver: 'smtp' as const,
      host: Env.get('MAIL_HOST', ''),
      port: Env.getInt('MAIL_PORT', 587),
      username: Env.get('MAIL_USERNAME', ''),
      password: Env.get('MAIL_PASSWORD', ''),
      secure: (() => {
        const raw = Env.get('MAIL_SECURE', '').trim().toLowerCase();
        if (raw === 'starttls') return 'starttls' as const;
        if (raw === 'tls' || raw === 'ssl' || raw === 'smtps' || raw === 'implicit') return true;
        if (raw === 'none' || raw === 'off' || raw === 'false' || raw === '0') return false;
        return Env.getBool('MAIL_SECURE', false);
      })(),
    },

    nodemailer: {
      driver: 'nodemailer' as const,
      host: Env.get('MAIL_HOST', ''),
      port: Env.getInt('MAIL_PORT', 587),
      username: Env.get('MAIL_USERNAME', ''),
      password: Env.get('MAIL_PASSWORD', ''),
      secure: (() => {
        const raw = Env.get('MAIL_SECURE', '').trim().toLowerCase();
        if (raw === 'starttls') return 'starttls' as const;
        if (raw === 'tls' || raw === 'ssl' || raw === 'smtps' || raw === 'implicit') return true;
        if (raw === 'none' || raw === 'off' || raw === 'false' || raw === '0') return false;
        return Env.getBool('MAIL_SECURE', false);
      })(),
    },

    ses: {
      driver: 'ses' as const,
      region: Env.get('AWS_REGION', 'us-east-1'),
    },
  },

  /**
   * Get selected driver config
   */
  getDriver(): MailDriverConfig {
    return getMailDriver(this);
  },
} as const;

export const mailConfig = Object.freeze(mailConfigObj);
export type MailConfig = typeof mailConfig;
