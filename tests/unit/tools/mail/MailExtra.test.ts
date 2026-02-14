import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/mail', () => ({
  mailConfig: {
    from: { address: 'from@example.com', name: 'From' },
    getDriver: vi.fn(() => ({ driver: 'sendgrid', apiKey: 'k' })),
    default: 'sendgrid',
  },
}));

vi.mock('@mail/drivers/SendGrid', () => ({
  SendGridDriver: { send: vi.fn(async () => ({ ok: true, messageId: 'sg-1' })) },
}));
vi.mock('@storage', () => ({ Storage: { getDisk: vi.fn() } }));

import { Mail } from '@/tools/mail';
import { mailConfig } from '@config/mail';
import { SendGridDriver } from '@mail/drivers/SendGrid';
import { Storage } from '@storage';
import { MailDriverRegistry } from '@tools/mail/MailDriverRegistry';

beforeEach(() => {
  vi.clearAllMocks();

  // Mail is registry-first for sendgrid/mailgun/smtp
  MailDriverRegistry.register('sendgrid', async (cfg, message) => {
    const apiKey = (cfg as any)?.apiKey;
    return SendGridDriver.send({ apiKey } as any, message as any);
  });
});

describe('Mail (extra tests)', () => {
  it('omits from.name when provided as blank', async () => {
    // Ensure sendgrid driver
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    await Mail.send({
      to: 'user@example.com',
      subject: 'Hi',
      text: 'Body',
      from: { address: 'me@example.com', name: '   ' },
    });

    expect(vi.mocked(SendGridDriver.send)).toHaveBeenCalled();
    const msg = vi.mocked(SendGridDriver.send).mock.calls[0][1] as any;
    expect(msg.from).toBeDefined();
    expect(msg.from.name).toBeUndefined();
  });

  it('throws when storage disk driver is missing get()', async () => {
    // Storage.getDisk returns a driver that has exists but no get
    // @ts-ignore
    vi.mocked(Storage.getDisk).mockImplementation(() => ({
      driver: {
        exists: () => true,
      },
      config: {},
    }));

    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    await expect(
      Mail.send({
        to: 'u@e.com',
        subject: 's',
        text: 't',
        attachments: [{ disk: 'd', path: 'p' }] as any,
      })
    ).rejects.toThrow(/missing get\(\)/i);
  });

  it('throws when storage disk driver is missing exists()', async () => {
    // Storage.getDisk returns a driver that has get but no exists
    // @ts-ignore
    vi.mocked(Storage.getDisk).mockImplementation(() => ({
      driver: {
        get: (_cfg: unknown, path: string) => Buffer.from('ok-' + path),
      },
      config: {},
    }));

    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    await expect(
      Mail.send({
        to: 'u@e.com',
        subject: 's',
        text: 't',
        attachments: [{ disk: 'd', path: 'p' }] as any,
      })
    ).rejects.toThrow(/missing exists\(\)/i);
  });

  it('throws when storage disk driver is not an object', async () => {
    // Storage.getDisk returns driver as null (invalid driver object)
    // @ts-ignore
    vi.mocked(Storage.getDisk).mockImplementation(() => ({
      driver: null,
      config: {},
    }));

    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    await expect(
      Mail.send({
        to: 'u@e.com',
        subject: 's',
        text: 't',
        attachments: [{ disk: 'd', path: 'p' }] as any,
      })
    ).rejects.toThrow(/driver is invalid \(expected object\)/i);
  });

  it('throws when driver is not implemented', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'unknown' });
    // make sure default has a readable value in message
    (mailConfig as any).default = 'unknown';

    await expect(Mail.send({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toThrow(
      /Mail driver not registered: unknown/i
    );
  });
});
