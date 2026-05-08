import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockS3Put = vi.fn().mockResolvedValue('s3-put');

vi.mock('@storage/drivers/S3', () => ({
  S3Driver: {
    put: (...args: unknown[]) => mockS3Put(...args),
    get: vi.fn(),
    exists: vi.fn(),
    delete: vi.fn(),
    tempUrl: vi.fn(),
  },
}));

describe('Storage Workers R2 integration', () => {
  const originalEnv = (globalThis as { env?: unknown }).env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete (globalThis as { env?: unknown }).env;
      return;
    }

    (globalThis as { env?: unknown }).env = originalEnv;
  });

  it('preserves binding on the default R2 disk and uploads through the Workers bucket without an endpoint', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'r2',
        drivers: {
          r2: {
            driver: 'r2',
            bucket: 'bucket',
            accessKeyId: 'AK',
            secretAccessKey: 'SK',
            binding: 'R2_BUCKET',
          },
        },
      },
    }));

    const bucket = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      head: vi.fn(),
      delete: vi.fn(),
    };

    (globalThis as { env?: unknown }).env = { R2_BUCKET: bucket };

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');
    const { R2Driver } = await import('@storage/drivers/R2');

    StorageDriverRegistry.register('r2', { driver: R2Driver });

    const { Storage } = await import('@storage');

    expect(Storage.getDisk().config).toMatchObject({
      bucket: 'bucket',
      binding: 'R2_BUCKET',
    });

    await expect(Storage.put(undefined, 'folder/file.txt', Buffer.from('hello'))).resolves.toBe(
      'https://bucket.r2.cloudflarestorage.com/folder/file.txt'
    );

    expect(bucket.put).toHaveBeenCalledWith('folder/file.txt', Buffer.from('hello'));
    expect(mockS3Put).not.toHaveBeenCalled();
  });
});
