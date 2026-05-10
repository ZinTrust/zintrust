import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockS3Put = vi.fn().mockResolvedValue('s3-put');

const baseConfig = {
  bucket: 'bucket',
  accessKeyId: 'AK',
  secretAccessKey: 'SK',
  binding: 'R2_BUCKET',
};

const createBucket = () => ({
  put: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  head: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
});

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

  it('reads Workers R2 objects from arrayBuffer and Uint8Array bodies', async () => {
    const bucket = createBucket();
    bucket.get
      .mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('hello').buffer),
      })
      .mockResolvedValueOnce({
        body: new Uint8Array([119, 111, 114, 108, 100]),
      });

    (globalThis as { env?: unknown }).env = { R2_BUCKET: bucket };

    const { R2Driver } = await import('@storage/drivers/R2');

    await expect(R2Driver.get(baseConfig, 'hello.txt')).resolves.toEqual(Buffer.from('hello'));
    await expect(R2Driver.get(baseConfig, 'world.txt')).resolves.toEqual(Buffer.from('world'));

    expect(bucket.get).toHaveBeenNthCalledWith(1, 'hello.txt');
    expect(bucket.get).toHaveBeenNthCalledWith(2, 'world.txt');
  });

  it('throws helpful Workers R2 errors for missing objects, unsupported bodies, and invalid multipart bindings', async () => {
    const bucket = createBucket();
    bucket.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ body: 'bad-body' });

    (globalThis as { env?: unknown }).env = { R2_BUCKET: bucket };

    const { R2Driver } = await import('@storage/drivers/R2');

    await expect(R2Driver.get(baseConfig, 'missing.txt')).rejects.toMatchObject({
      message: 'R2 get failed',
      statusCode: 404,
      code: 'NOT_FOUND',
    });

    await expect(R2Driver.get(baseConfig, 'invalid.txt')).rejects.toMatchObject({
      message: 'R2 get failed: unsupported Workers object body',
    });

    (globalThis as { env?: unknown }).env = { R2_BUCKET: createBucket() };

    await expect(R2Driver.createMultipartUpload(baseConfig, 'multipart.txt')).rejects.toMatchObject(
      {
        message:
          'R2 multipart requires a Workers R2 binding with multipart support (set config.binding or R2_BUCKET/R2/BUCKET).',
      }
    );
  });

  it('uses Workers head/delete operations directly when a binding is present', async () => {
    const bucket = createBucket();
    bucket.head.mockResolvedValueOnce({ etag: '123' }).mockResolvedValueOnce(null);

    (globalThis as { env?: unknown }).env = { R2_BUCKET: bucket };

    const { R2Driver } = await import('@storage/drivers/R2');

    await expect(R2Driver.exists(baseConfig, 'present.txt')).resolves.toBe(true);
    await expect(R2Driver.exists(baseConfig, 'missing.txt')).resolves.toBe(false);
    await expect(R2Driver.delete(baseConfig, 'delete-me.txt')).resolves.toBeUndefined();

    expect(bucket.head).toHaveBeenNthCalledWith(1, 'present.txt');
    expect(bucket.head).toHaveBeenNthCalledWith(2, 'missing.txt');
    expect(bucket.delete).toHaveBeenCalledWith('delete-me.txt');
  });

  it('throws when a configured Workers binding resolves to a non-object value', async () => {
    (globalThis as { env?: unknown }).env = { R2_BUCKET: 'invalid-binding' };

    const { R2Driver } = await import('@storage/drivers/R2');

    await expect(R2Driver.delete(baseConfig, 'bad.txt')).rejects.toMatchObject({
      message: 'R2 requires a Workers R2 binding (set config.binding or R2_BUCKET/R2/BUCKET).',
    });
  });
});
