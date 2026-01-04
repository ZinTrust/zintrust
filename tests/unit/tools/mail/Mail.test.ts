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
vi.mock('@mail/drivers/Mailgun', () => ({
  MailgunDriver: { send: vi.fn(async () => ({ ok: true, messageId: 'mg-1' })) },
}));
vi.mock('@mail/drivers/Smtp', () => ({
  SmtpDriver: { send: vi.fn(async () => ({ ok: true, messageId: 'smtp-1' })) },
}));
vi.mock('@mail/drivers/Ses', () => ({
  SesDriver: { send: vi.fn(async () => ({ ok: true, messageId: 'ses-1' })) },
}));
vi.mock('@storage', () => ({ Storage: { getDisk: vi.fn() } }));

import { Mail } from '@/tools/mail/Mail';
import { mailConfig } from '@config/mail';
import { MailgunDriver } from '@mail/drivers/Mailgun';
import { SendGridDriver } from '@mail/drivers/SendGrid';
import { SesDriver } from '@mail/drivers/Ses';
import { SmtpDriver } from '@mail/drivers/Smtp';
import { Storage } from '@storage';

beforeEach(() => vi.clearAllMocks());

describe('Mail', () => {
  it('throws when driver is disabled', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'disabled' });
    await expect(Mail.send({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toBeDefined();
  });

  it('throws when from address missing', async () => {
    const originalFrom = mailConfig.from;

    // override from address (mailConfig typings treat these as readonly)
    (mailConfig as any).from = { ...originalFrom, address: '' };

    try {
      // restore driver
      vi.mocked(mailConfig.getDriver as any).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

      await expect(Mail.send({ to: 'a@b.com', subject: 's', text: 't' })).rejects.toBeDefined();
    } finally {
      // restore
      (mailConfig as any).from = originalFrom;
    }
  });

  it('sends via sendgrid and returns messageId', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    const res = await Mail.send({ to: 'user@example.com', subject: 'Hi', text: 't' });
    expect(res.ok).toBe(true);
    expect(res.driver).toBe('sendgrid');
    expect(res.messageId).toBe('sg-1');
    expect(vi.mocked(SendGridDriver.send)).toHaveBeenCalled();
  });

  it('throws when storage disk invalid for attachments', async () => {
    // Storage.getDisk returns invalid
    // @ts-ignore
    vi.mocked(Storage.getDisk).mockReturnValue(null);
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    await expect(
      Mail.send({
        to: 'u@e.com',
        subject: 's',
        text: 't',
        attachments: [{ disk: 'd', path: 'p' }] as any,
      })
    ).rejects.toBeDefined();
  });

  it('resolves disk attachments and includes them in driver message', async () => {
    // Mock Storage.getDisk to return disk with driver.get and exists
    // @ts-ignore
    vi.mocked(Storage.getDisk).mockImplementation((_disk: string) => ({
      driver: {
        get: (_cfg: unknown, path: string) => Buffer.from('ok-' + path),
        exists: (_cfg: unknown, _path: string) => true,
      },
      config: {},
    }));

    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    const res = await Mail.send({
      to: 'a@b.com',
      subject: 's',
      text: 't',
      attachments: [{ disk: 'd', path: 'p/file.txt' } as any],
    });

    expect(res.ok).toBe(true);
    expect(res.driver).toBe('sendgrid');
    expect(vi.mocked(SendGridDriver.send)).toHaveBeenCalled();

    const msg = vi.mocked(SendGridDriver.send).mock.calls[0][1] as any;
    expect(Array.isArray(msg.attachments)).toBe(true);
    expect(msg.attachments[0].filename).toBe('file.txt');
  });

  it('sends via smtp driver', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'smtp', host: 'h', port: 587 });

    const res = await Mail.send({ to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(true);
    expect(res.driver).toBe('smtp');
    expect(vi.mocked(SmtpDriver.send)).toHaveBeenCalled();
  });

  it('sends via mailgun driver', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({
      driver: 'mailgun',
      apiKey: 'k',
      domain: 'd',
    });

    const res = await Mail.send({ to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(true);
    expect(res.driver).toBe('mailgun');
    expect(vi.mocked(MailgunDriver.send)).toHaveBeenCalled();
  });

  it('sends via ses driver', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'ses', region: 'us-east-1' });

    const res = await Mail.send({ to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(true);
    expect(res.driver).toBe('ses');
    expect(vi.mocked(SesDriver.send)).toHaveBeenCalled();
  });

  it('uses provided from address and name', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    const res = await Mail.send({
      to: 'a@b.com',
      subject: 's',
      text: 't',
      from: { address: 'custom@example.com', name: 'Custom Name' },
    });
    expect(res.ok).toBe(true);

    const msg = vi.mocked(SendGridDriver.send).mock.calls[0][1] as any;
    expect(msg.from).toEqual({ email: 'custom@example.com', name: 'Custom Name' });
  });

  it('trims name when empty or whitespace', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    const res = await Mail.send({
      to: 'a@b.com',
      subject: 's',
      text: 't',
      from: { address: 'custom@example.com', name: '  ' },
    });
    expect(res.ok).toBe(true);

    const msg = vi.mocked(SendGridDriver.send).mock.calls[0][1] as any;
    expect(msg.from).toEqual({ email: 'custom@example.com' });
  });

  it('includes html when provided', async () => {
    // @ts-ignore
    vi.mocked(mailConfig.getDriver).mockReturnValue({ driver: 'sendgrid', apiKey: 'k' });

    const res = await Mail.send({
      to: 'a@b.com',
      subject: 's',
      text: 't',
      html: '<p>html content</p>',
    });
    expect(res.ok).toBe(true);

    const msg = vi.mocked(SendGridDriver.send).mock.calls[0][1] as any;
    expect(msg.html).toBe('<p>html content</p>');
  });
});
