import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn(async () => undefined);
const fetchMock = vi.fn();
const emailMessageCtor = vi.fn(function (
  this: Record<string, unknown>,
  from: string,
  to: string,
  raw: string
) {
  this.from = from;
  this.to = to;
  this.raw = raw;
});

vi.mock('cloudflare:email', () => ({
  EmailMessage: emailMessageCtor,
}));

describe('CloudflareDriver', () => {
  beforeEach(() => {
    sendMock.mockClear();
    fetchMock.mockReset();
    emailMessageCtor.mockClear();
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as typeof globalThis & { env?: Record<string, unknown> }).env = {
      SEND_EMAIL: { send: sendMock },
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete (globalThis as typeof globalThis & { env?: Record<string, unknown> }).env;
  });

  it('sends one message per recipient through the configured binding', async () => {
    const { CloudflareDriver } = await import('@mail/drivers/Cloudflare');

    const result = await CloudflareDriver.send(
      { driver: 'cl', binding: 'SEND_EMAIL' },
      {
        from: { email: 'from@example.com', name: 'From' },
        to: ['first@example.com', 'second@example.com'],
        subject: 'Hello',
        text: 'Plain text body',
        html: '<p>HTML body</p>',
      }
    );

    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(emailMessageCtor).toHaveBeenCalledTimes(2);
    expect(emailMessageCtor.mock.calls[0]?.[0]).toBe('from@example.com');
    expect(emailMessageCtor.mock.calls[0]?.[1]).toBe('first@example.com');
    expect(String(emailMessageCtor.mock.calls[0]?.[2])).toContain('Subject: Hello');
    expect(String(emailMessageCtor.mock.calls[0]?.[2])).toContain('Date: ');
    expect(String(emailMessageCtor.mock.calls[0]?.[2])).toMatch(
      /Message-ID: <[a-f0-9]+@example\.com>/i
    );
  });

  it('fails clearly outside the Workers runtime', async () => {
    delete (globalThis as typeof globalThis & { env?: Record<string, unknown> }).env;
    const { CloudflareDriver } = await import('@mail/drivers/Cloudflare');

    await expect(
      CloudflareDriver.send(
        { driver: 'cl', binding: 'SEND_EMAIL' },
        {
          from: { email: 'from@example.com' },
          to: 'first@example.com',
          subject: 'Hello',
          text: 'Plain text body',
        }
      )
    ).rejects.toThrow(/Cloudflare Workers runtime/i);
  });

  it('forwards mail through the signed proxy when proxy mode is configured', async () => {
    vi.stubEnv('MAIL_CLOUDFLARE_PROXY_URL', 'https://proxy.example.test/base');
    vi.stubEnv('MAIL_CLOUDFLARE_PROXY_KEY_ID', 'mail-key');
    vi.stubEnv('MAIL_CLOUDFLARE_PROXY_SECRET', 'mail-secret');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, messageId: 'proxy-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { CloudflareDriver } = await import('@mail/drivers/Cloudflare');

    const result = await CloudflareDriver.send(
      { driver: 'cl', binding: 'SEND_EMAIL' },
      {
        from: { email: 'from@example.com', name: 'From' },
        to: 'first@example.com',
        subject: 'Proxy hello',
        text: 'Proxy body',
        attachments: [{ filename: 'demo.txt', content: Buffer.from('proxy-data', 'utf8') }],
      }
    );

    expect(result).toEqual({ ok: true, messageId: 'proxy-1' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(emailMessageCtor).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('https://proxy.example.test/base/zin/mail/cloudflare/send');
    expect(init.method).toBe('POST');
    expect(String((init.headers as Record<string, string>)['x-zt-key-id'])).toBe('mail-key');

    const payload = JSON.parse(String(init.body)) as {
      binding: string;
      message: { attachments?: Array<{ contentBase64: string }> };
    };
    expect(payload.binding).toBe('SEND_EMAIL');
    expect(payload.message.attachments?.[0]?.contentBase64).toBe(
      Buffer.from('proxy-data', 'utf8').toString('base64')
    );
  });
});
