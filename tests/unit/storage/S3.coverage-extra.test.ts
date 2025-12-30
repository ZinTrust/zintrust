import { ErrorFactory } from '@exceptions/ZintrustError';
import { S3Driver } from '@storage/drivers/S3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('S3Driver extra coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_SESSION_TOKEN'];
  });

  it('put throws ConnectionError when fetch is not ok', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = { ok: false, status: 500, text: async () => 'nope' } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    await expect(
      S3Driver.put(
        { bucket: 'b', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
        'k',
        'v'
      )
    ).rejects.toHaveProperty('code', 'CONNECTION_ERROR');
  });

  it('get throws NotFoundError when fetch is not ok', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = { ok: false, status: 404, text: async () => 'missing' } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    await expect(
      S3Driver.get(
        { bucket: 'b', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
        'k'
      )
    ).rejects.toHaveProperty('code', 'NOT_FOUND');
  });

  it('exists returns false when fetch throws', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('boom')))
    );

    const ok = await S3Driver.exists(
      { bucket: 'b', region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SK' },
      'k'
    );
    expect(ok).toBe(false);
  });

  it('delete succeeds when fetch is ok', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';

    const fakeRes = { ok: true, status: 204, text: async () => '' } as unknown as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeRes)
    );

    await expect(
      S3Driver.delete(
        { bucket: 'b', region: 'us-west-2', accessKeyId: 'AK', secretAccessKey: 'SK' },
        'k'
      )
    ).resolves.toBeUndefined();
  });

  it('url and tempUrl use endpoint path-style when endpoint is provided', () => {
    const cfg = {
      bucket: 'mybucket',
      region: 'us-east-1',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      endpoint: 'https://minio.local:9000/',
    };

    expect(S3Driver.url(cfg, 'a/b.txt')).toBe('https://minio.local:9000/mybucket/a/b.txt');

    const signed = S3Driver.tempUrl(cfg, 'a/b.txt', { expiresIn: 60, method: 'PUT' });
    expect(signed).toContain('https://minio.local:9000/mybucket/a/b.txt?');
    expect(signed).toContain('X-Amz-Signature=');
  });

  it('uses AWS_SESSION_TOKEN when set', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SECRET';
    process.env['AWS_SESSION_TOKEN'] = 'TOKEN';

    const fakeRes = { ok: true, status: 200, text: async () => '' } as unknown as Response;
    const fetchSpy = vi.fn(async () => fakeRes);
    vi.stubGlobal('fetch', fetchSpy);

    await S3Driver.put({ bucket: 'b', region: 'us-east-1' } as any, 'k', 'v');

    const headers = (fetchSpy.mock.calls[0]?.[1] as any)?.headers as Record<string, string>;
    expect(headers['x-amz-security-token']).toBe('TOKEN');
  });

  it('validateExpiresIn throws validation errors (directly via tempUrl)', () => {
    const cfg = { bucket: 'b', region: 'r', accessKeyId: 'AK', secretAccessKey: 'SK' } as any;

    expect(() => S3Driver.tempUrl(cfg, 'k', { expiresIn: Number.NaN })).toThrow(
      ErrorFactory.createValidationError('S3: expiresIn must be a positive number', {
        expiresIn: Number.NaN,
      })
    );
  });
});
