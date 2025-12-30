import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SendGridDriver } from '@mail/drivers/SendGrid';

describe('SendGrid attachments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('encodes attachments in request body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 202, headers: { get: () => 'id' }, text: async () => '' });
    (globalThis as any).fetch = fetchMock;

    const res = await SendGridDriver.send(
      { apiKey: 'k' },
      {
        to: 'a@b.com',
        from: { email: 'noreply@example.com' },
        subject: 'hi',
        text: 't',
        attachments: [{ filename: 'f.txt', content: Buffer.from('hello') }],
      }
    );

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse((fetchMock as any).mock.calls[0][1].body);
    expect(body.attachments[0].filename).toBe('f.txt');
    expect(body.attachments[0].content).toBe(Buffer.from('hello').toString('base64'));
  });
});
