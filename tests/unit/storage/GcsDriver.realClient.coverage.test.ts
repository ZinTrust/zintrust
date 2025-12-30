import { afterEach, describe, expect, it, vi } from 'vitest';

describe('GcsDriver loadRealClient coverage', () => {
  afterEach(() => {
    vi.resetModules();
    delete (globalThis as any).__fakeGoogleCloudStorageModule;
    delete (globalThis as any).__fakeGcsClient;
  });

  it('throws config error when injected module has no Storage export', async () => {
    vi.resetModules();
    delete (globalThis as any).__fakeGcsClient;
    (globalThis as any).__fakeGoogleCloudStorageModule = { Storage: 123 };

    const { GcsDriver } = await import('@/tools/storage/drivers/Gcs');

    await expect(GcsDriver.put({ bucket: 'b' }, 'k', 'v')).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
      message: 'GCS: @google-cloud/storage did not export Storage',
    });
  });

  it('throws config error when injected module is missing Storage', async () => {
    vi.resetModules();
    delete (globalThis as any).__fakeGcsClient;
    (globalThis as any).__fakeGoogleCloudStorageModule = {};

    const { GcsDriver } = await import('@/tools/storage/drivers/Gcs');

    await expect(GcsDriver.put({ bucket: 'b' }, 'k', 'v')).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
      message: 'GCS: @google-cloud/storage did not export Storage',
    });
  });

  it('creates and caches a real client from injected module and passes options', async () => {
    vi.resetModules();

    const calls: any[] = [];

    const Storage = function (this: any, opts?: Record<string, unknown>) {
      calls.push(opts ?? null);

      const store = new Map<string, Buffer>();

      this.bucket = (bucketName: string) => ({
        file: (key: string) => {
          const fullKey = `${bucketName}/${key}`;
          return {
            save: async (content: string | Buffer) => {
              store.set(
                fullKey,
                typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
              );
            },
            download: async () => {
              const v = store.get(fullKey) ?? Buffer.from('');
              return [v];
            },
            exists: async () => [store.has(fullKey)],
            delete: async () => {
              store.delete(fullKey);
            },
            getSignedUrl: async () => [`https://signed.example/${fullKey}`],
          };
        },
      });
    } as any;

    (globalThis as any).__fakeGoogleCloudStorageModule = { Storage };

    const { GcsDriver } = await import('@/tools/storage/drivers/Gcs');

    const config = {
      bucket: 'my-bucket',
      projectId: 'proj-1',
      keyFile: '/tmp/key.json',
    };

    const url1 = await GcsDriver.put(config, 'a.txt', 'hello');
    expect(url1).toContain('storage.googleapis.com');

    // Second call should reuse the cached client instance (no new Storage() call)
    const url2 = await GcsDriver.put(config, 'b.txt', Buffer.from('world'));
    expect(url2).toContain('storage.googleapis.com');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ projectId: 'proj-1', keyFilename: '/tmp/key.json' });
  });

  it('does not pass empty projectId/keyFile options', async () => {
    vi.resetModules();

    const calls: any[] = [];

    const Storage = function (this: any, opts?: Record<string, unknown>) {
      calls.push(opts ?? null);
      this.bucket = (_bucketName: string) => ({
        file: (_key: string) => ({
          save: async () => undefined,
          download: async () => [Buffer.from('')],
          getSignedUrl: async () => ['https://signed.example/x'],
        }),
      });
    } as any;

    (globalThis as any).__fakeGoogleCloudStorageModule = { Storage };

    const { GcsDriver } = await import('@/tools/storage/drivers/Gcs');

    await GcsDriver.put({ bucket: 'b', projectId: '  ', keyFile: '' }, 'k', 'v');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({});
  });

  it('wraps Storage constructor errors as a config error', async () => {
    vi.resetModules();
    delete (globalThis as any).__fakeGcsClient;

    const Storage = function () {
      throw new Error('boom');
    } as any;

    (globalThis as any).__fakeGoogleCloudStorageModule = { Storage };

    const { GcsDriver } = await import('@/tools/storage/drivers/Gcs');

    await expect(GcsDriver.put({ bucket: 'b' }, 'k', 'v')).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
      message: 'GCS: failed to initialize Storage client',
    });
  });
});
