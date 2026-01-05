import { describe, expect, it } from 'vitest';

import { StorageDiskRegistry } from '@storage/StorageDiskRegistry';
import { registerDisksFromRuntimeConfig } from '@storage/StorageRuntimeRegistration';

describe('StorageRuntimeRegistration patch coverage (extra)', () => {
  it('registers default using fallback when getDriverConfig is missing', () => {
    StorageDiskRegistry.reset();

    registerDisksFromRuntimeConfig({
      default: 'missing',
      drivers: {
        local: { driver: 'local', root: 'storage' } as any,
      },
    } as any);

    expect(StorageDiskRegistry.has('default')).toBe(true);
  });
});
