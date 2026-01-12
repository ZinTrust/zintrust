import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Storage (src/tools/storage/index.ts branch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('normalizes S3 config (key/secret + usePathStyleUrl + endpoint type guards)', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 's3',
        drivers: {
          s3: {
            driver: '  S3  ',
            bucket: 123,
            region: 'us-east-1',
            key: 'AK',
            secret: 'SK',
            endpoint: 42,
            usePathStyleUrl: 1,
          },
        },
      },
    }));

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');
    StorageDriverRegistry.register('s3', { driver: { name: 's3-driver' } });

    const { Storage } = await import('@storage');
    const disk = Storage.getDisk('s3');

    expect(disk.driver).toEqual({ name: 's3-driver' });
    expect(disk.config).toMatchObject({
      bucket: '123',
      region: 'us-east-1',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      endpoint: undefined,
      usePathStyle: true,
    });
  });

  it('normalizes R2 and GCS config (type guards + optional fields)', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'r2',
        drivers: {
          r2: {
            driver: 'r2',
            bucket: 'b',
            region: 123,
            secretAccessKey: 'SK',
            accessKeyId: 'AK',
            endpoint: 'https://endpoint.example',
            url: 'https://public.example',
          },
          gcs: {
            driver: 'gcs',
            bucket: 'g',
            projectId: 123,
            keyFile: '/tmp/key.json',
            url: 5,
          },
        },
      },
    }));

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');
    StorageDriverRegistry.register('r2', { driver: { name: 'r2-driver' } });
    StorageDriverRegistry.register('gcs', { driver: { name: 'gcs-driver' } });

    const { Storage } = await import('@storage');

    const r2 = Storage.getDisk('r2');
    expect(r2.driver).toEqual({ name: 'r2-driver' });
    expect(r2.config).toMatchObject({
      bucket: 'b',
      region: undefined,
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
      endpoint: 'https://endpoint.example',
      url: 'https://public.example',
    });

    const gcs = Storage.getDisk('gcs');
    expect(gcs.driver).toEqual({ name: 'gcs-driver' });
    expect(gcs.config).toMatchObject({
      bucket: 'g',
      projectId: undefined,
      keyFile: '/tmp/key.json',
      url: undefined,
    });
  });

  it('throws for unknown disk name and unsupported unregistered driver', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'default',
        drivers: {
          default: { driver: 'ftp' },
        },
      },
    }));

    const { Storage } = await import('@storage');

    expect(() => Storage.getDisk('missing')).toThrow(/disk not configured|unknown disk/i);
    expect(() => Storage.getDisk('default')).toThrow(/unsupported disk driver/i);
  });

  it('put/get throw when driver is missing methods', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'custom',
        drivers: {
          custom: { driver: 'custom' },
        },
      },
    }));

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');
    StorageDriverRegistry.register('custom', { driver: {} });

    const { Storage } = await import('@storage');

    await expect(Storage.put('custom', 'a.txt', 'hi')).rejects.toThrow(/missing put\(\)/i);
    await expect(Storage.get('custom', 'a.txt')).rejects.toThrow(/missing get\(\)/i);
  });

  it('put/get return driver results when implemented', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'ok',
        drivers: {
          ok: { driver: 'ok' },
        },
      },
    }));

    const putSpy = vi.fn(async () => 'stored-key');
    const getSpy = vi.fn(async () => Buffer.from('hello', 'utf8'));

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');
    StorageDriverRegistry.register('ok', {
      driver: {
        put: putSpy,
        get: getSpy,
      },
    });

    const { Storage } = await import('@storage');

    await expect(Storage.put('ok', 'a.txt', 'hi')).resolves.toBe('stored-key');
    await expect(Storage.get('ok', 'a.txt')).resolves.toEqual(Buffer.from('hello', 'utf8'));
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('exists/delete/url/tempUrl cover optional-method branches', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'd',
        drivers: {
          d: { driver: 'd' },
          e: { driver: 'e' },
          f: { driver: 'f' },
          g: { driver: 'g' },
          h: { driver: 'h' },
          i: { driver: 'i' },
        },
      },
    }));

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');

    const deleteSpy = vi.fn();

    StorageDriverRegistry.register('d', {
      driver: {
        url: () => 'https://example.test/file.txt',
      },
    });

    StorageDriverRegistry.register('e', {
      driver: {
        exists: () => false,
      },
    });

    StorageDriverRegistry.register('f', {
      driver: {
        delete: deleteSpy,
      },
    });

    StorageDriverRegistry.register('g', {
      driver: {
        url: () => '   ',
      },
    });

    StorageDriverRegistry.register('h', {
      driver: {
        tempUrl: () => 'https://tmp.example.test/file.txt?sig=1',
      },
    });

    StorageDriverRegistry.register('i', {
      driver: {
        url: () => 'https://fallback.example.test/file.txt',
      },
    });

    const { Storage } = await import('@storage');

    // exists: missing exists() => true
    await expect(Storage.exists('d', 'x')).resolves.toBe(true);
    // exists: exists() => false
    await expect(Storage.exists('e', 'x')).resolves.toBe(false);

    // delete: missing delete() => no-op
    await expect(Storage.delete('d', 'x')).resolves.toBeUndefined();
    // delete: delete() present
    await expect(Storage.delete('f', 'x')).resolves.toBeUndefined();
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    // url: ok
    expect(Storage.url('d', 'x')).toBe('https://example.test/file.txt');
    // url: invalid => throws
    expect(() => Storage.url('g', 'x')).toThrow(/cannot build url\(\)/i);

    // tempUrl: uses driver.tempUrl
    await expect(Storage.tempUrl('h', 'x', { expiresIn: 60 })).resolves.toMatch(/^https:\/\/tmp\./);
    // tempUrl: falls back to url()
    await expect(Storage.tempUrl('i', 'x', { expiresIn: 60 })).resolves.toBe(
      'https://fallback.example.test/file.txt'
    );
    // tempUrl: no tempUrl and invalid url => throws
    await expect(Storage.tempUrl('g', 'x', { expiresIn: 60 })).rejects.toThrow(
      /does not support tempUrl\(\)/i
    );
  });
});
