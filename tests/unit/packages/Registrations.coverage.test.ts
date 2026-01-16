import { describe, expect, it, vi } from 'vitest';

describe('package registration coverage', () => {
  it('registers redis queue driver', async () => {
    const register = vi.fn();

    vi.doMock('@zintrust/core', () => ({
      Queue: { register },
      RedisQueue: { name: 'redis' },
    }));

    const mod = await import('../../../packages/queue-redis/src/register');
    await mod.registerRedisQueueDriver({ register });

    expect(register).toHaveBeenCalled();
  });

  it('registers storage drivers', async () => {
    const register = vi.fn();

    vi.doMock('@zintrust/core', () => ({
      StorageDriverRegistry: { register },
      S3Driver: { name: 's3' },
      R2Driver: { name: 'r2' },
      GcsDriver: { name: 'gcs' },
    }));

    const s3 = await import('../../../packages/storage-s3/src/register');
    const r2 = await import('../../../packages/storage-r2/src/register');
    const gcs = await import('../../../packages/storage-gcs/src/register');

    await s3.registerS3StorageDriver({ register });
    await r2.registerR2StorageDriver({ register });
    await gcs.registerGcsStorageDriver({ register });

    expect(register).toHaveBeenCalled();
  });

  it('warns when mongo cache uri missing', async () => {
    const warn = vi.fn();
    vi.doMock('@zintrust/core', () => ({
      Logger: { warn },
    }));

    const { MongoCacheDriver } = await import('../../../packages/cache-mongodb/src/index');
    const driver = MongoCacheDriver.create({
      driver: 'mongodb',
      uri: '',
      db: 'db',
      ttl: 60,
    });

    const value = await driver.get('key');
    expect(value).toBeNull();
    expect(warn).toHaveBeenCalledWith('MongoDB cache driver missing uri. Request ignored.');
  });
});
