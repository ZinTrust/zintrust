import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SesDriver } from '@mail/drivers/Ses';

describe('SesDriver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_SESSION_TOKEN'];
  });

  it('throws when AWS credentials missing', async () => {
    await expect(() =>
      SesDriver.send(
        { region: 'us-east-1' },
        {
          to: 'a@b.com',
          from: { email: 'no-reply@example.com' },
          subject: 'x',
          text: 'y',
        }
      )
    ).rejects.toThrow();
  });

  it('throws when region is missing or blank', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    await expect(
      SesDriver.send(
        { region: '   ' },
        {
          to: 'user@example.com',
          from: { email: 'no-reply@example.com' },
          subject: 'Hello',
          text: 'Plain',
        }
      )
    ).rejects.toThrow(/missing region/i);
  });

  it('throws when region is not a string', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    await expect(
      SesDriver.send(
        { region: null as any },
        {
          to: 'user@example.com',
          from: { email: 'no-reply@example.com' },
          subject: 'Hello',
          text: 'Plain',
        }
      )
    ).rejects.toThrow(/missing region/i);
  });

  it('sends with fetch and returns messageId on success', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => ({ MessageId: 'abc-123' }),
    } as unknown as Response;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    const result = await SesDriver.send(
      { region: 'us-east-1' },
      {
        to: 'user@example.com',
        from: { email: 'no-reply@example.com' },
        subject: 'Hello',
        text: 'Plain',
      }
    );

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('ses');
    expect(result.messageId).toBe('abc-123');

    const fetchMock = vi.mocked(globalThis.fetch as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const called = fetchMock.mock.calls[0];
    expect(called[0]).toContain('email.us-east-1.amazonaws.com');
    const hdrs = called[1].headers;
    expect(hdrs['Authorization']).toMatch(/AWS4-HMAC-SHA256/);
  });

  it('returns ok without messageId when success response has no MessageId', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    const result = await SesDriver.send(
      { region: 'us-east-1' },
      {
        to: ['user@example.com'],
        from: { email: 'no-reply@example.com' },
        subject: 'Hello',
        text: 'Plain',
        html: '<p>Hello</p>',
      }
    );

    expect(result).toEqual({ ok: true, provider: 'ses', messageId: undefined });
  });

  it('throws connection error when fetch returns not ok', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = {
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    } as unknown as Response;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    await expect(() =>
      SesDriver.send(
        { region: 'us-east-1' },
        {
          to: 'user@example.com',
          from: { email: 'no-reply@example.com' },
          subject: 'Hello',
          text: 'Plain',
        }
      )
    ).rejects.toThrow();
  });

  it('returns ok when response is ok but JSON parsing fails', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    await expect(
      SesDriver.send(
        { region: 'us-east-1' },
        {
          to: 'user@example.com',
          from: { email: 'no-reply@example.com' },
          subject: 'Hello',
          text: 'Plain',
        }
      )
    ).resolves.toEqual({ ok: true, provider: 'ses' });
  });
});
