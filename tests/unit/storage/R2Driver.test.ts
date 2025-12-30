import { R2Driver } from '@storage/drivers/R2';
import { describe, expect, it } from 'vitest';

describe('R2Driver', () => {
  it('tempUrl throws when endpoint is missing', () => {
    expect(() =>
      R2Driver.tempUrl({ bucket: 'b', accessKeyId: 'AK', secretAccessKey: 'SK' }, 'k', {
        expiresIn: 60,
      })
    ).toThrow();
  });

  it('tempUrl returns a presigned url against the endpoint', () => {
    const url = R2Driver.tempUrl(
      {
        bucket: 'mybucket',
        accessKeyId: 'AK',
        secretAccessKey: 'SK',
        endpoint: 'https://account.r2.cloudflarestorage.com',
        region: 'auto',
      },
      'path/file.txt',
      { expiresIn: 60, method: 'GET' }
    );

    const u = new URL(url);
    expect(u.hostname).toBe('account.r2.cloudflarestorage.com');
    expect(u.pathname).toBe('/mybucket/path/file.txt');
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Credential')).toContain('AK/');
    expect(u.searchParams.get('X-Amz-Date')).toMatch(/^\d{8}T\d{6}Z$/);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});
