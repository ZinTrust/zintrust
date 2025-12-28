import { S3Driver } from '@storage/drivers/S3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('S3Driver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_SESSION_TOKEN'];
  });

  it('throws when credentials missing', async () => {
    await expect(() =>
      S3Driver.put(
        { bucket: 'x', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' },
        'k',
        'v'
      )
    ).rejects.toThrow();
  });

  it('put uses fetch and returns url', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = { ok: true, status: 200, text: async () => '' } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    const url = await S3Driver.put(
      { bucket: 'mybucket', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
      'path/file.txt',
      'content'
    );
    expect(url).toContain('mybucket');
    const fetchMock = vi.mocked(global.fetch as any);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const called = fetchMock.mock.calls[0];
    const hdrs = called[1].headers;
    expect(hdrs['Authorization']).toMatch(/AWS4-HMAC-SHA256/);
  });

  it('get returns buffer on success', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('hello'),
    } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    const buf = await S3Driver.get(
      { bucket: 'x', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
      'path'
    );
    expect(buf.toString('utf8')).toBe('hello');
  });

  it('exists returns true for 200 HEAD', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';
    const fakeRes = { ok: true, status: 200 } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    const ok = await S3Driver.exists(
      { bucket: 'x', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
      'path'
    );
    expect(ok).toBe(true);
  });

  it('delete throws on error', async () => {
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
      S3Driver.delete(
        { bucket: 'x', region: 'us-west-2', accessKeyId: 'AK', secretAccessKey: 'SK' },
        'path'
      )
    ).rejects.toThrow();
  });

  it('tempUrl returns a presigned url with required query params', () => {
    const url = S3Driver.tempUrl(
      { bucket: 'mybucket', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
      'path/file.txt',
      { expiresIn: 60, method: 'GET' }
    );

    const u = new URL(url);
    expect(u.hostname).toBe('mybucket.s3.us-east-1.amazonaws.com');
    expect(u.pathname).toBe('/path/file.txt');
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Credential')).toContain('AK/');
    expect(u.searchParams.get('X-Amz-Date')).toMatch(/^\d{8}T\d{6}Z$/);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tempUrl throws for invalid expiresIn', () => {
    expect(() =>
      S3Driver.tempUrl(
        { bucket: 'b', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
        'k',
        { expiresIn: 0 }
      )
    ).toThrow();

    expect(() =>
      S3Driver.tempUrl(
        { bucket: 'b', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
        'k',
        { expiresIn: 604801 }
      )
    ).toThrow();
  });
});
