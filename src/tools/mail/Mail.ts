import { mailConfig } from '@config/mail';
import { ErrorFactory } from '@exceptions/ZintrustError';

import type { MailAddress } from '@mail/drivers/SendGrid';
import { SesDriver } from '@mail/drivers/Ses';

import { resolveAttachments, type AttachmentInput } from '@mail/attachments';
import { MailDriverRegistry } from '@mail/MailDriverRegistry';
import { Storage } from '@tools/storage';

export type SendMailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: {
    address?: string;
    name?: string;
  };
  attachments?: AttachmentInput[];
};

export type SendMailResult = {
  ok: boolean;
  driver: 'sendgrid' | 'disabled' | 'smtp' | 'ses' | 'mailgun' | 'nodemailer';
  messageId?: string;
};

type StorageWrapper = {
  get: (disk: string, path: string) => Promise<Buffer>;
  exists: (disk: string, path: string) => Promise<boolean>;
};

type StorageDiskLike = {
  driver: {
    get: (config: unknown, path: string) => Promise<Buffer> | Buffer;
    exists: (config: unknown, path: string) => Promise<boolean> | boolean;
  };
  config: unknown;
};

const resolveFrom = (input?: SendMailInput['from']): MailAddress => {
  const address = input?.address ?? mailConfig.from.address;
  const name = input?.name ?? mailConfig.from.name;

  if (address.trim() === '') {
    const err = ErrorFactory.createConfigError(
      'Mail: missing from address (set MAIL_FROM_ADDRESS or pass from.address)'
    );
    throw err;
  }

  return { email: address, name: name.trim() === '' ? undefined : name };
};

function assertStorageDiskLike(value: unknown): asserts value is StorageDiskLike {
  if (typeof value !== 'object' || value === null) {
    const err = ErrorFactory.createConfigError('Storage disk is invalid (expected object)');
    throw err;
  }

  const v = value as Record<string, unknown>;
  const driver = v['driver'];

  if (typeof driver !== 'object' || driver === null) {
    const err = ErrorFactory.createConfigError('Storage disk driver is invalid (expected object)');
    throw err;
  }

  const d = driver as Record<string, unknown>;

  if (typeof d['get'] !== 'function') {
    const err = ErrorFactory.createConfigError('Storage disk driver is missing get()');
    throw err;
  }

  if (typeof d['exists'] !== 'function') {
    const err = ErrorFactory.createConfigError('Storage disk driver is missing exists()');
    throw err;
  }
}

const getDiskSafe = (disk: string): StorageDiskLike => {
  const diskValue = Storage.getDisk(disk) as unknown;
  assertStorageDiskLike(diskValue);
  return diskValue;
};

const createStorageWrapper = (): StorageWrapper => ({
  async get(disk: string, path: string) {
    const d = getDiskSafe(disk);
    const result = await Promise.resolve(d.driver.get(d.config, path));
    return result;
  },
  async exists(disk: string, path: string) {
    const d = getDiskSafe(disk);
    const result = await Promise.resolve(d.driver.exists(d.config, path));
    return Boolean(result);
  },
});

type MailMessage = {
  to: SendMailInput['to'];
  from: MailAddress;
  subject: string;
  text: string;
  html?: string;
  attachments: Awaited<ReturnType<typeof resolveAttachments>>;
};

const sendWithDriver = async (
  driver: ReturnType<typeof mailConfig.getDriver>,
  message: MailMessage
): Promise<SendMailResult> => {
  if (driver.driver === 'ses') {
    const result = await SesDriver.send({ region: driver.region }, message);
    return { ok: result.ok, driver: 'ses', messageId: result.messageId };
  }

  // Drivers resolve via MailDriverRegistry (external packages)
  const external = MailDriverRegistry.get(driver.driver);
  if (external !== undefined) {
    const result = await external(driver as unknown, message);
    return {
      ok: Boolean(result?.ok),
      driver: driver.driver as SendMailResult['driver'],
      messageId: typeof result?.messageId === 'string' ? result.messageId : undefined,
    };
  }

  if (driver.driver === 'sendgrid' || driver.driver === 'mailgun' || driver.driver === 'smtp') {
    throw ErrorFactory.createConfigError(
      `Mail driver not registered: ${driver.driver} (run \`zin add mail:${driver.driver}\` / \`npm i @zintrust/mail-${driver.driver}\`)`
    );
  }

  // Config exists for future drivers, but implementations are intentionally CLI/runtime-safe and added incrementally.
  {
    const err = ErrorFactory.createConfigError(
      `Mail driver not implemented: ${mailConfig.default}`
    );
    throw err;
  }
};

export const Mail = Object.freeze({
  async send(input: SendMailInput): Promise<SendMailResult> {
    const driver = mailConfig.getDriver();

    if (driver.driver === 'disabled') {
      const err = ErrorFactory.createConfigError('Mail driver is disabled (set MAIL_DRIVER)');
      throw err;
    }

    const from = resolveFrom(input.from);
    const storage = createStorageWrapper();
    const attachments = await resolveAttachments(input.attachments, { storage });

    return sendWithDriver(driver, {
      to: input.to,
      from,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments,
    });
  },
});

export default Mail;
