import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Mail (SendGrid)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();

    process.env['MAIL_DRIVER'] = 'sendgrid';
    process.env['MAIL_FROM_ADDRESS'] = 'no-reply@example.com';
    process.env['MAIL_FROM_NAME'] = 'Zintrust';
    process.env['SENDGRID_API_KEY'] = 'SG.test-key';
  });

  it('sends via SendGrid with correct request shape', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        status: 202,
        headers: {
          get: (k: string) => (k.toLowerCase() === 'x-message-id' ? 'msg-123' : null),
        },
        text: async () => '',
        ok: true,
      } as unknown as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { SendGridDriver } = await import('@mail/drivers/SendGrid');
    MailDriverRegistry.register('sendgrid', async (cfg, message) => {
      const apiKey = (cfg as any)?.apiKey;
      return SendGridDriver.send({ apiKey } as any, message as any);
    });

    const { Mail } = await import('@mail/Mail');

    const result = await Mail.send({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Plain text',
      html: '<p>Hello</p>',
    });

    expect(result.ok).toBe(true);
    expect(result.driver).toBe('sendgrid');
    expect(result.messageId).toBe('msg-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['Authorization']).toContain('Bearer ');

    const body = JSON.parse(String(init.body));
    expect(body.subject).toBe('Hello');
    expect(body.from.email).toBe('no-reply@example.com');
    expect(body.personalizations[0].to[0].email).toBe('user@example.com');
  });

  it('errors if SENDGRID_API_KEY is missing', async () => {
    process.env['SENDGRID_API_KEY'] = '';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { SendGridDriver } = await import('@mail/drivers/SendGrid');
    MailDriverRegistry.register('sendgrid', async (cfg, message) => {
      const apiKey = (cfg as any)?.apiKey;
      return SendGridDriver.send({ apiKey } as any, message as any);
    });

    const { Mail } = await import('@mail/Mail');

    await expect(
      Mail.send({ to: 'user@example.com', subject: 'Hi', text: 'Body' })
    ).rejects.toBeDefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
