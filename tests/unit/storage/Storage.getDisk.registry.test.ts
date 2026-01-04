import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Storage.getDisk (registry integration)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('throws a config error when a known driver is not registered', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 's3',
        drivers: {
          s3: { driver: '  S3  ' },
        },
      },
    }));

    const { Storage } = await import('@storage');

    expect(() => Storage.getDisk('s3')).toThrow(/Storage driver not registered: s3/i);
  });

  it('uses registry normalize() when provided', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'custom',
        drivers: {
          custom: { driver: 'CUSTOM', bucket: 'raw-bucket' },
        },
      },
    }));

    const { StorageDriverRegistry } = await import('@storage/StorageDriverRegistry');
    StorageDriverRegistry.register('custom', {
      driver: { name: 'custom-driver' },
      normalize: (raw) => ({ ...raw, normalized: true }),
    });

    const { Storage } = await import('@storage');

    const disk = Storage.getDisk('custom');
    expect(disk.driver).toEqual({ name: 'custom-driver' });
    expect(disk.config).toMatchObject({ bucket: 'raw-bucket', normalized: true });
  });
});
