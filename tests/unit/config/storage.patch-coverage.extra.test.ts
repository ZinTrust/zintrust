import { describe, expect, it } from 'vitest';

import { storageConfig } from '@config/storage';

describe('src/config/storage patch coverage (extra)', () => {
  it('throws when an explicit disk selection is missing', () => {
    const fakeConfig = {
      default: 'local',
      drivers: {
        local: { driver: 'local', root: 'storage' },
      },
    };

    expect(() => (storageConfig.getDriverConfig as any).call(fakeConfig, 'missing')).toThrow(
      /Storage disk not configured/i
    );
  });

  it('falls back to local when default is missing', () => {
    const fakeConfig = {
      default: 'missing',
      drivers: {
        local: { driver: 'local', root: 'storage' },
      },
    };

    expect(() => (storageConfig.getDriverConfig as any).call(fakeConfig, undefined)).toThrow(
      /Storage default disk not configured/i
    );
  });

  it('throws when no disks are configured', () => {
    const fakeConfig = {
      default: 'missing',
      drivers: {},
    };

    expect(() => (storageConfig.getDriverConfig as any).call(fakeConfig, undefined)).toThrow(
      /No storage disks are configured/i
    );
  });

  it('exposes temp/uploads/backups getters and proxy metadata', () => {
    expect(storageConfig.temp).toMatchObject({
      path: expect.any(String),
      maxAge: expect.any(Number),
    });

    expect(storageConfig.uploads).toMatchObject({
      maxSize: expect.any(String),
      allowedMimes: expect.any(String),
      path: expect.any(String),
    });

    expect(storageConfig.backups).toMatchObject({
      path: expect.any(String),
      driver: expect.any(String),
    });

    const keys = Reflect.ownKeys(storageConfig as unknown as object);
    expect(keys).toContain('default');

    const desc = Object.getOwnPropertyDescriptor(storageConfig as unknown as object, 'temp');
    expect(desc).not.toBeUndefined();
  });
});
