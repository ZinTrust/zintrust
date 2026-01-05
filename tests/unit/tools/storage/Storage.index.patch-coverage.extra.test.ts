import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Storage index patch coverage (extra)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('uses StorageDiskRegistry when default is registered', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'local',
        drivers: {},
      },
    }));

    const { StorageDiskRegistry } = await import('@storage/StorageDiskRegistry');
    StorageDiskRegistry.reset();
    StorageDiskRegistry.register('default', { driver: 'local', root: 'storage' } as any);

    const { Storage } = await import('@storage');
    const disk = Storage.getDisk();

    expect(disk.config).toMatchObject({ root: 'storage' });
  });

  it('falls back to legacy local driver when getDriverConfig is unavailable', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'missing',
        drivers: {
          local: { driver: 'local', root: 'storage' },
        },
      },
    }));

    const { StorageDiskRegistry } = await import('@storage/StorageDiskRegistry');
    StorageDiskRegistry.reset();

    const { Storage } = await import('@storage');
    const disk = Storage.getDisk();
    expect(disk.config).toMatchObject({ root: 'storage' });
  });

  it('throws when no disks are configured anywhere', async () => {
    vi.doMock('@config/storage', () => ({
      storageConfig: {
        default: 'local',
        drivers: {},
      },
    }));

    const { StorageDiskRegistry } = await import('@storage/StorageDiskRegistry');
    StorageDiskRegistry.reset();

    const { Storage } = await import('@storage');
    expect(() => Storage.getDisk()).toThrow(/no disks are configured/i);
  });
});
