/**
 * Mail Configuration
 * Runtime mail drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';

export type MailDriverName = 'disabled' | 'sendgrid' | 'smtp' | 'ses';

export type DisabledMailDriverConfig = {
  driver: 'disabled';
};

export type SendGridMailDriverConfig = {
  driver: 'sendgrid';
  apiKey: string;
};

// Placeholders for future drivers (kept config-first)
export type SmtpMailDriverConfig = {
  driver: 'smtp';
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean | 'starttls';
};

export type SesMailDriverConfig = {
  driver: 'ses';
  region: string;
};

export type MailDriverConfig =
  | DisabledMailDriverConfig
  | SendGridMailDriverConfig
  | SmtpMailDriverConfig
  | SesMailDriverConfig;

type MailDrivers = {
  disabled: DisabledMailDriverConfig;
  sendgrid: SendGridMailDriverConfig;
  smtp: SmtpMailDriverConfig;
  ses: SesMailDriverConfig;
};

type MailConfigInput = {
  default: MailDriverName;
  from: {
    address: string;
    name: string;
  };
  drivers: MailDrivers;
};

const getMailDriver = (config: MailConfigInput): MailDriverConfig => {
  const defaultDriver = config.default;

  if (Object.prototype.hasOwnProperty.call(config.drivers, defaultDriver)) {
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
