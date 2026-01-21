/**
 * Mail Configuration
 * Runtime mail drivers and settings
 * Sealed namespace for immutability
 */

import { Env } from '@config/env';
import type { MailConfigInput, MailDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { StartupConfigFile, StartupConfigFileRegistry } from '@runtime/StartupConfigFileRegistry';

export type MailConfigOverrides = Partial<{
  default: string;
  from: { address: string; name: string };
  drivers: Record<string, MailDriverConfig>;
}>;

const isMailDriverConfig = (value: unknown): value is MailDriverConfig => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('driver' in value)) return false;

  const driver = (value as { driver?: unknown }).driver;
  return typeof driver === 'string' && driver.trim().length > 0;
};

const getMailDriver = (config: MailConfigInput, name?: string): MailDriverConfig => {
  const drivers = config.drivers as Record<string, unknown>;
  const envSelectedRaw = Env.get('MAIL_CONNECTION', Env.get('MAIL_DRIVER', '')).trim();
  const selected = (
    name ??
    (envSelectedRaw.length > 0 ? envSelectedRaw : undefined) ??
    config.default
  )
    .toString()
    .trim();

  if (selected.length === 0) {
    const disabled = drivers['disabled'];
    if (isMailDriverConfig(disabled)) return disabled;
    throw ErrorFactory.createConfigError('Mail driver not configured: disabled');
  }

  if (Object.hasOwn(drivers, selected)) {
    const resolved = drivers[selected];
    if (isMailDriverConfig(resolved)) return resolved;
  }

  throw ErrorFactory.createConfigError(`Mail driver not configured: ${selected}`);
};

const createMailConfig = (): {
  default: string;
  from: { address: string; name: string };
  drivers: Record<string, MailDriverConfig>;
  getDriver: (this: MailConfigInput, name?: string) => MailDriverConfig;
} => {
  const overrides: MailConfigOverrides =
    StartupConfigFileRegistry.get<MailConfigOverrides>(StartupConfigFile.Mail) ?? {};

  const baseDefault = Env.get('MAIL_CONNECTION', Env.get('MAIL_DRIVER', 'disabled'))
    .trim()
    .toLowerCase();
  const baseFrom = {
    address: Env.get('MAIL_FROM_ADDRESS', ''),
    name: Env.get('MAIL_FROM_NAME', ''),
  };
  const baseDrivers: Record<string, MailDriverConfig> = {
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
  };

  const mailConfigObj = {
    /**
     * Default mail driver
     */
    default: (overrides.default ?? baseDefault).trim().toLowerCase(),

    /**
     * Default "From" identity
     */
    from: {
      ...baseFrom,
      ...overrides.from,
    },

    /**
     * Driver configs
     */
    drivers: {
      ...baseDrivers,
      ...overrides.drivers,
    },

    /**
     * Get selected driver config
     */
    getDriver(name?: string): MailDriverConfig {
      return getMailDriver(this, name);
    },
  } as const;

  return Object.freeze(mailConfigObj);
};

export type MailConfig = ReturnType<typeof createMailConfig>;

let cached: MailConfig | null = null;
const proxyTarget: MailConfig = {} as MailConfig;

const ensureMailConfig = (): MailConfig => {
  if (cached) return cached;
  cached = createMailConfig();

  try {
    Object.defineProperties(
      proxyTarget as unknown as object,
      Object.getOwnPropertyDescriptors(cached)
    );
  } catch {
    // best-effort
  }

  return cached;
};

export const mailConfig: MailConfig = new Proxy(proxyTarget, {
  get(_target, prop: keyof MailConfig) {
    return ensureMailConfig()[prop];
  },
  ownKeys() {
    ensureMailConfig();
    return Reflect.ownKeys(proxyTarget as unknown as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    ensureMailConfig();
    return Object.getOwnPropertyDescriptor(proxyTarget as unknown as object, prop);
  },
});
