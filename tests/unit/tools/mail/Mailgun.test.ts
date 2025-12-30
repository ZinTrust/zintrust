import { MailgunDriver } from '@/tools/mail/drivers/Mailgun';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MailgunDriver', () => {
  it('throws when config is missing apiKey or domain', async () => {
    await expect(
      MailgunDriver.send(
        { apiKey: '', domain: '' },
        { to: 'a@b.com', from: { email: 'x@y.com' }, subject: 's', text: 't' }
      )
    ).rejects.toBeDefined();
  });

  it('throws when message.from.email is empty', async () => {
    await expect(
      MailgunDriver.send(
        { apiKey: 'k', domain: 'd' },
        { to: 'a@b.com', from: { email: '' }, subject: 's', text: 't' }
      )
    ).rejects.toBeDefined();
  });

  it('sends message and returns messageId when fetch returns id', async () => {
    const mockJson = vi.fn(async () => ({ id: 'msg-123' }));
    const mockFetch = vi.fn(async () => ({ ok: true, json: mockJson }));

    // Minimal FormData stub to capture set/append calls
    class FormDataStub {
      public calls: any[] = [];
      set(name: string, value: unknown) {
        this.calls.push(['set', name, value]);
      }
      append(name: string, value: unknown, filename?: string) {
        this.calls.push(['append', name, value, filename]);
      }
    }

    // Simple Blob stub
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BlobStub: any = function (parts: any[]) {
      return { parts };
    };

    vi.stubGlobal('fetch', mockFetch);
    // @ts-ignore
    vi.stubGlobal('FormData', FormDataStub);
    // @ts-ignore
    vi.stubGlobal('Blob', BlobStub);

    const res = await MailgunDriver.send(
      { apiKey: 'key', domain: 'example.com', baseUrl: 'https://api.mailgun.net/' },
      {
        to: ['a@x.com', 'b@y.com'],
        from: { email: 'from@example.com', name: 'Sender' },
        subject: 'Hello',
        text: 'Text',
        html: '<p>Hi</p>',
        attachments: [{ filename: 'a.txt', content: Buffer.from('abc') }],
      }
    );

    expect(res.ok).toBe(true);
    expect(res.provider).toBe('mailgun');
    expect(res.messageId).toBe('msg-123');
    // Ensure fetch was called with normalized baseUrl and encoded domain
    expect(mockFetch).toHaveBeenCalled();
    const calls = mockFetch.mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThan(0);
    const url = String(calls[0]?.[0] ?? '');
    expect(url).toContain('/v3/');
    expect(url).toContain(encodeURIComponent('example.com'));
  });

  it('handles ok responses with invalid json (returns ok without id)', async () => {
    const mockJson = vi.fn(async () => {
      throw new Error('bad json');
    });
    const mockFetch = vi.fn(async () => ({ ok: true, json: mockJson }));

    vi.stubGlobal('fetch', mockFetch);
    // @ts-ignore
    vi.stubGlobal(
      'FormData',
      class {
        set(..._args: unknown[]) {
          // no-op: minimal stub for tests
        }
      }
    );

    const res = await MailgunDriver.send(
      { apiKey: 'key', domain: 'example.com' },
      {
        to: 'a@x.com',
        from: { email: 'from@example.com' },
        subject: 'Hello',
        text: 'Text',
      }
    );

    expect(res.ok).toBe(true);
    expect(res.provider).toBe('mailgun');
    expect(res.messageId).toBeUndefined();
  });

  it('throws connection error when fetch returns non-ok', async () => {
    const mockText = vi.fn(async () => 'error body');
    const mockFetch = vi.fn(async () => ({ ok: false, status: 500, text: mockText }));

    vi.stubGlobal('fetch', mockFetch);
    // @ts-ignore
    vi.stubGlobal(
      'FormData',
      class {
        set(..._args: unknown[]) {
          // no-op: minimal stub for tests
        }
      }
    );

    await expect(
      MailgunDriver.send(
        { apiKey: 'key', domain: 'example.com' },
        { to: 'a@x.com', from: { email: 'from@example.com' }, subject: 'Hello', text: 'Text' }
      )
    ).rejects.toBeDefined();
  });
});
