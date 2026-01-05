/**
 * Mail Configuration
 * Runtime mail drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from './env';
import type { MailConfigInput, MailDriverConfig } from './type';
import { ErrorFactory } from '@zintrust/core';

const getMailDriver = (config: MailConfigInput, name?: string): MailDriverConfig => {
  const selected = (name ?? config.default).toString().trim();
  if (selected.length === 0) {
    const disabled = config.drivers['disabled'];
    if (disabled !== undefined) return disabled;
    throw ErrorFactory.createConfigError('Mail driver not configured: disabled');
  }

  if (Object.hasOwn(config.drivers, selected)) {
    const resolved = config.drivers[selected];
    if (resolved !== undefined) return resolved;
  }

  // Backward-compatible fallback: if the default is misconfigured, treat mail as disabled.
  if (name === undefined) {
    const disabled = config.drivers['disabled'];
    if (disabled !== undefined) return disabled;
    throw ErrorFactory.createConfigError('Mail driver not configured: disabled');
  }

  throw ErrorFactory.createConfigError(`Mail driver not configured: ${selected}`);
};

const mailConfigObj = {
  /**
   * Default mail driver
   */
  default: Env.get('MAIL_DRIVER', 'disabled').trim().toLowerCase() || 'disabled',

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
  getDriver(name?: string): MailDriverConfig {
    return getMailDriver(this, name);
  },
} as const;

export const mailConfig = Object.freeze(mailConfigObj);
export type MailConfig = typeof mailConfig;
