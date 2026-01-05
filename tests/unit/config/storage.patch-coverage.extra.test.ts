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

    const cfg = (storageConfig.getDriverConfig as any).call(fakeConfig, undefined);
    expect(cfg).toMatchObject({ driver: 'local' });
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
});
