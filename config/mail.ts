// @ts-ignore - config templates are excluded from the main TS project in this repo
import { Env } from '@config/env';
import type { MailConfigOverrides } from '@config/mail';

/**
 * Mail Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 */

export default {
  default: Env.get('MAIL_CONNECTION', Env.get('MAIL_DRIVER', 'smtp')).trim().toLowerCase(),
  from: {
    address: Env.get('MAIL_FROM_ADDRESS', ''),
    name: Env.get('MAIL_FROM_NAME', 'ZinTrust Framework'),
  },
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
} satisfies MailConfigOverrides;
