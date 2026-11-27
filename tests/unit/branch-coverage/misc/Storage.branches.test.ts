import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registryHas: vi.fn(),
  registryGet: vi.fn(),
  driverRegistryGet: vi.fn(),
  getDriverConfig: vi.fn(),
  storageConfig: {} as any,
  localDriver: {} as any,
}));

vi.mock('@storage/StorageDiskRegistry', () => ({
  StorageDiskRegistry: { has: mocks.registryHas, get: mocks.registryGet },
}));
vi.mock('@storage/StorageDriverRegistry', () => ({
  StorageDriverRegistry: { get: mocks.driverRegistryGet },
}));
vi.mock('@config/storage', () => ({ storageConfig: mocks.storageConfig }));
vi.mock('@storage/drivers/Local', () => ({ LocalDriver: mocks.localDriver }));

import { Storage } from '@tools/storage';

const resetConfig = (config: Record<string, unknown> = {}) => {
  for (const key of Object.keys(mocks.storageConfig)) Reflect.deleteProperty(mocks.storageConfig, key);
  Object.assign(mocks.storageConfig, config);
  mocks.storageConfig.getDriverConfig = mocks.getDriverConfig;
};

describe('Storage uncovered branches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetConfig({ drivers: {}, default: 'local' });
    mocks.registryHas.mockReturnValue(false);
    mocks.getDriverConfig.mockReturnValue(undefined);
    mocks.driverRegistryGet.mockReturnValue(undefined);
  });

  it('getDisk resolves named and default disks from the registry', () => {
    mocks.registryHas.mockReturnValue(true);
    mocks.registryGet.mockReturnValue({ driver: 'local', root: '/tmp' });
    expect(Storage.getDisk('media')).toMatchObject({ config: { root: '/tmp' } });
    expect(mocks.registryGet).toHaveBeenCalledWith('media');

    Storage.getDisk(undefined);
    expect(mocks.registryGet).toHaveBeenCalledWith('default');
    Storage.getDisk('   ');
    expect(mocks.registryGet).toHaveBeenCalledWith('default');
  });

  it('getDisk falls back to storageConfig.getDriverConfig', () => {
    mocks.getDriverConfig.mockReturnValue({ driver: 'local', url: '/u' });
    expect(Storage.getDisk('media')).toMatchObject({ config: { url: '/u' } });
    expect(mocks.getDriverConfig).toHaveBeenCalledWith('media');
  });

  it('getDisk uses legacy drivers with default and local fallbacks', () => {
    resetConfig({ drivers: { local: { driver: 'local', root: '/legacy' } }, default: 'local' });
    expect(Storage.getDisk()).toMatchObject({ config: { root: '/legacy' } });
    expect(Storage.getDisk('default')).toMatchObject({ config: { root: '/legacy' } });

    resetConfig({ drivers: { remote: { driver: 'custom' } }, default: 'remote' });
    mocks.driverRegistryGet.mockReturnValue({ driver: {} });
    expect(Storage.getDisk()).toMatchObject({ config: { driver: 'custom' } });

    resetConfig({ drivers: {}, default: 'local' });
    expect(() => Storage.getDisk('missing')).toThrow(/Storage disk not configured/);
  });

  it('getDisk throws when no configuration exists', () => {
    expect(() => Storage.getDisk()).toThrow(/no disks are configured/);
  });

  it.each([
    ['local', { root: 1, url: 'u' }, { root: '1', url: 'u' }],
    ['local', {}, { root: '', url: undefined }],
    ['s3', { key: 'k', secret: 's', usePathStyleUrl: true, endpoint: 'http://x' }, { accessKeyId: 'k', secretAccessKey: 's', usePathStyle: true, endpoint: 'http://x' }],
    ['r2', { key: 'k', secret: 's', region: 9, binding: 'B' }, { accessKeyId: 'k', secretAccessKey: 's', region: undefined, binding: 'B' }],
    ['gcs', { projectId: 3, keyFile: 'f' }, { projectId: undefined, keyFile: 'f' }],
  ])('normalizes %s config', (driver, raw, expected) => {
    resetConfig({ drivers: { d: { driver, ...raw } }, default: 'd' });
    mocks.driverRegistryGet.mockReturnValue({ driver: {} });
    expect(Storage.getDisk().config).toMatchObject(expected);
  });

  it('uses registry driver normalize when available, otherwise built-in normalizer', () => {
    resetConfig({ drivers: { d: { driver: 'custom', raw: 1 } }, default: 'd' });
    mocks.driverRegistryGet.mockReturnValue({
      driver: { tag: 'custom' },
      normalize: (cfg: any) => ({ normalized: cfg.raw }),
    });
    expect(Storage.getDisk()).toMatchObject({ config: { normalized: 1 } });

    mocks.driverRegistryGet.mockReturnValue({ driver: { tag: 'plain' } });
    expect(Storage.getDisk().config).toMatchObject({ raw: 1 });
  });

  it('reports unregistered s3-family and unsupported drivers', () => {
    for (const driver of ['s3', 'r2', 'gcs']) {
      resetConfig({ drivers: { d: { driver } }, default: 'd' });
      expect(() => Storage.getDisk()).toThrow(/Storage driver not registered/);
    }
    resetConfig({ drivers: { d: { driver: 'ftp' } }, default: 'd' });
    expect(() => Storage.getDisk()).toThrow(/unsupported disk driver/);
  });

  it('put and get require driver methods', async () => {
    resetConfig({ drivers: { d: { driver: 'custom' } }, default: 'd' });
    mocks.driverRegistryGet.mockReturnValue({ driver: {} });
    await expect(Storage.put(undefined, 'a', 'x')).rejects.toThrow(/missing put/);
    await expect(Storage.get(undefined, 'a')).rejects.toThrow(/missing get/);

    const driver = { put: vi.fn().mockResolvedValue('url'), get: vi.fn().mockResolvedValue(Buffer.from('x')) };
    mocks.driverRegistryGet.mockReturnValue({ driver });
    await expect(Storage.put(undefined, 'a', 'x')).resolves.toBe('url');
    await expect(Storage.get(undefined, 'a')).resolves.toEqual(Buffer.from('x'));
  });

  it('exists and delete tolerate optional methods', async () => {
    resetConfig({ drivers: { d: { driver: 'custom' } }, default: 'd' });
    mocks.driverRegistryGet.mockReturnValue({ driver: {} });
    await expect(Storage.exists(undefined, 'a')).resolves.toBe(true);
    await expect(Storage.delete(undefined, 'a')).resolves.toBeUndefined();

    mocks.driverRegistryGet.mockReturnValue({ driver: { exists: async () => false, delete: vi.fn() } });
    await expect(Storage.exists(undefined, 'a')).resolves.toBe(false);
    await expect(Storage.delete(undefined, 'a')).resolves.toBeUndefined();
  });

  it('url and tempUrl handle missing or blank urls', async () => {
    resetConfig({ drivers: { d: { driver: 'custom' } }, default: 'd' });
    mocks.driverRegistryGet.mockReturnValue({ driver: {} });
    expect(() => Storage.url(undefined, 'a')).toThrow(/cannot build url/);
    await expect(Storage.tempUrl(undefined, 'a')).rejects.toThrow(/does not support tempUrl/);

    mocks.driverRegistryGet.mockReturnValue({ driver: { url: () => '   ' } });
    expect(() => Storage.url(undefined, 'a')).toThrow(/cannot build url/);
    await expect(Storage.tempUrl(undefined, 'a')).rejects.toThrow(/does not support tempUrl/);

    mocks.driverRegistryGet.mockReturnValue({ driver: { tempUrl: async () => 'temp', url: () => '/u' } });
    await expect(Storage.tempUrl(undefined, 'a', { expiresIn: 5 })).resolves.toBe('temp');
    expect(Storage.url(undefined, 'a')).toBe('/u');

    mocks.driverRegistryGet.mockReturnValue({ driver: { url: () => '/fallback' } });
    await expect(Storage.tempUrl(undefined, 'a')).resolves.toBe('/fallback');
  });
});
