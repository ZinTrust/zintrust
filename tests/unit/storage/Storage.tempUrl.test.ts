import { beforeEach, describe, expect, it } from 'vitest';

describe('Storage.tempUrl', () => {
  beforeEach(() => {
    delete process.env['STORAGE_DRIVER'];
    delete process.env['STORAGE_URL'];
    delete process.env['AWS_REGION'];
    delete process.env['AWS_S3_BUCKET'];
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_SESSION_TOKEN'];
    delete process.env['APP_KEY'];
  });

  it('defaults to local and returns a url', async () => {
    process.env['STORAGE_DRIVER'] = 'local';
    process.env['STORAGE_URL'] = '/storage';
    process.env['APP_KEY'] = 'test-app-key';

    const { Storage } = await import('@storage');
    const url = await Storage.tempUrl(undefined, 'a/b.txt', { expiresIn: 60 });
    expect(url.startsWith('/storage/download?token=')).toBe(true);
  });

  it('normalizes S3 driver config from env and returns a presigned url', async () => {
    process.env['STORAGE_DRIVER'] = 's3';
    process.env['AWS_REGION'] = 'us-east-1';
    process.env['AWS_S3_BUCKET'] = 'mybucket';
    process.env['AWS_ACCESS_KEY_ID'] = 'AK';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'SK';

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');
    const { S3Driver } = await import('@storage/drivers/S3');
    StorageDriverRegistry.register('s3', { driver: S3Driver });

    const { Storage } = await import('@storage');

    const disk = Storage.getDisk('s3');
    const cfg = disk.config as Record<string, unknown>;
    expect(cfg['accessKeyId']).toBe('AK');
    expect(cfg['secretAccessKey']).toBe('SK');

    const presigned = await Storage.tempUrl('s3', 'path/file.txt', { expiresIn: 60 });
    const u = new URL(presigned);
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});
