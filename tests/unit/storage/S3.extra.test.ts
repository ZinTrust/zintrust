import { ErrorFactory } from '@exceptions/ZintrustError';
import { S3Driver } from '@storage/drivers/S3';
import { describe, expect, it } from 'vitest';

describe('S3Driver small branches', () => {
  it('throws config error when credentials missing', async () => {
    const cfg = { bucket: 'b', region: 'r' } as any;
    await expect(S3Driver.put(cfg, 'k', 'c')).rejects.toThrow(
      ErrorFactory.createConfigError('S3: missing AWS credentials')
    );

    await expect(S3Driver.get(cfg, 'k')).rejects.toThrow(
      ErrorFactory.createConfigError('S3: missing AWS credentials')
    );
  });

  it('url uses endpoint when provided and default otherwise', () => {
    expect(
      S3Driver.url(
        {
          bucket: 'b',
          region: 'r',
          accessKeyId: 'a',
          secretAccessKey: 's',
          endpoint: 'https://e',
        } as any,
        'k'
      )
    ).toBe('https://e/b/k');

    expect(
      S3Driver.url({ bucket: 'b', region: 'r', accessKeyId: 'a', secretAccessKey: 's' } as any, 'k')
    ).toBe('https://b.s3.r.amazonaws.com/k');
  });

  it('tempUrl validates expiresIn and returns signed url', () => {
    const cfg = { bucket: 'b', region: 'r', accessKeyId: 'AK', secretAccessKey: 'SK' } as any;

    expect(() => S3Driver.tempUrl(cfg, 'k', { expiresIn: 0 })).toThrow();
    expect(() => S3Driver.tempUrl(cfg, 'k', { expiresIn: 604801 })).toThrow();

    const url = S3Driver.tempUrl(cfg, 'some/path with spaces.txt');
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('https://b.s3.r.amazonaws.com');
    // ensure path segments are encoded
    expect(url).toContain('some/path%20with%20spaces.txt');
  });
});
