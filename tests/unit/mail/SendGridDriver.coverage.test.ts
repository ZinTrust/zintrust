import { describe, expect, it, vi } from 'vitest';

import { SendGridDriver } from '@mail/drivers/SendGrid';

describe('SendGridDriver coverage', () => {
  it('sends successfully and normalizes fields', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        status: 202,
        ok: true,
        headers: { get: () => null },
        text: async () => '',
      } as unknown as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const out = await SendGridDriver.send(
      { apiKey: 'SG.key' },
      {
        to: ['a@example.com', 'b@example.com'],
        from: { email: 'no-reply@example.com', name: '   ' },
        subject: 's',
        text: 't',
      }
    );

    expect(out).toEqual({ ok: true, provider: 'sendgrid', messageId: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0]?.[1] as any;
    const body = JSON.parse(String(init.body));
    expect(body.personalizations[0].to).toHaveLength(2);
    expect(body.from.name).toBeUndefined();
  });

  it('throws when from.email is missing', async () => {
    await expect(
      SendGridDriver.send(
        { apiKey: 'SG.key' },
        {
          to: 'user@example.com',
          from: { email: '   ' },
          subject: 's',
          text: 't',
        }
      )
    ).rejects.toHaveProperty('message', 'Mail: missing from.email');
  });

  it('throws connection error when SendGrid responds non-202', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        status: 500,
        ok: false,
        headers: { get: () => null },
        text: async () => 'fail',
      } as unknown as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      SendGridDriver.send(
        { apiKey: 'SG.key' },
        {
          to: 'user@example.com',
          from: { email: 'no-reply@example.com' },
          subject: 's',
          text: 't',
        }
      )
    ).rejects.toBeDefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
