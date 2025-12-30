import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SesDriver session token coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();

    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';
    process.env['AWS_SESSION_TOKEN'] = 'TOKEN';
  });

  it('includes x-amz-security-token in signing headers and request headers', async () => {
    const buildAuthorization = vi.fn(() => ({
      authorization: 'AWS4-HMAC-SHA256 test',
      signedHeaders: 'content-type;host;x-amz-date;x-amz-security-token',
    }));

    vi.doMock('@common/index', () => ({
      AwsSigV4: {
        sha256Hex: () => 'hash',
        toAmzDate: () => ({ amzDate: '20200101T000000Z', dateStamp: '20200101' }),
        buildAuthorization,
      },
    }));

    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ MessageId: 'abc-123' }),
      } as unknown as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const { SesDriver } = await import('@mail/drivers/Ses');

    const result = await SesDriver.send(
      { region: 'us-east-1' },
      {
        to: 'user@example.com',
        from: { email: 'no-reply@example.com' },
        subject: 'Hello',
        text: 'Plain',
      }
    );

    expect(result).toMatchObject({ ok: true, provider: 'ses', messageId: 'abc-123' });

    expect(buildAuthorization).toHaveBeenCalledTimes(1);
    const authArg = buildAuthorization.mock.calls[0]?.[0] as any;
    expect(authArg.headers?.['x-amz-security-token']).toBe('TOKEN');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as any;
    expect(init.headers?.['x-amz-security-token']).toBe('TOKEN');
  });
});
