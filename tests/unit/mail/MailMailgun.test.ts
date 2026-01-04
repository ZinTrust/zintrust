import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Mail (Mailgun)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();

    process.env['MAIL_DRIVER'] = 'mailgun';
    process.env['MAIL_FROM_ADDRESS'] = 'no-reply@example.com';
    process.env['MAIL_FROM_NAME'] = 'Zintrust';
    process.env['MAILGUN_API_KEY'] = 'key-test';
    process.env['MAILGUN_DOMAIN'] = 'mg.example.com';
    process.env['MAILGUN_BASE_URL'] = 'https://api.mailgun.net';
  });

  it('sends via Mailgun with correct request shape', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: '<msg-123@mg.example.com>' }),
        text: async () => '',
      } as unknown as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { MailgunDriver } = await import('@mail/drivers/Mailgun');
    MailDriverRegistry.register('mailgun', async (cfg, message) => {
      const apiKey = (cfg as any)?.apiKey;
      const domain = (cfg as any)?.domain;
      const baseUrl = (cfg as any)?.baseUrl;
      return MailgunDriver.send({ apiKey, domain, baseUrl } as any, message as any);
    });

    const { Mail } = await import('@mail/Mail');

    const result = await Mail.send({
      to: ['user1@example.com', 'user2@example.com'],
      subject: 'Hello',
      text: 'Plain text',
      html: '<p>Hello</p>',
    });

    expect(result.ok).toBe(true);
    expect(result.driver).toBe('mailgun');
    expect(result.messageId).toBe('<msg-123@mg.example.com>');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toBe('https://api.mailgun.net/v3/mg.example.com/messages');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Basic\s+/);

    expect(init.body).toBeInstanceOf(FormData);

    const fd = init.body as FormData;
    const entries = Array.from(fd.entries());
    const map = new Map(entries.map(([k, v]) => [k, v]));

    expect(String(map.get('subject'))).toBe('Hello');
    expect(String(map.get('text'))).toBe('Plain text');
    expect(String(map.get('html'))).toBe('<p>Hello</p>');
    expect(String(map.get('to'))).toBe('user1@example.com,user2@example.com');
    expect(String(map.get('from'))).toBe('Zintrust <no-reply@example.com>');
  });

  it('errors if MAILGUN_API_KEY is missing', async () => {
    process.env['MAILGUN_API_KEY'] = '';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { MailgunDriver } = await import('@mail/drivers/Mailgun');
    MailDriverRegistry.register('mailgun', async (cfg, message) => {
      const apiKey = (cfg as any)?.apiKey;
      const domain = (cfg as any)?.domain;
      const baseUrl = (cfg as any)?.baseUrl;
      return MailgunDriver.send({ apiKey, domain, baseUrl } as any, message as any);
    });

    const { Mail } = await import('@mail/Mail');

    await expect(
      Mail.send({ to: 'user@example.com', subject: 'Hi', text: 'Body' })
    ).rejects.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
