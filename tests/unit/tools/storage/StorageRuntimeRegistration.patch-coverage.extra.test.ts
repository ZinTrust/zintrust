import { describe, expect, it } from 'vitest';

import { StorageDiskRegistry } from '@storage/StorageDiskRegistry';
import { registerDisksFromRuntimeConfig } from '@storage/StorageRuntimeRegistration';

describe('StorageRuntimeRegistration patch coverage (extra)', () => {
  it('throws when default disk is missing (no fallback)', () => {
    StorageDiskRegistry.reset();

    expect(() =>
      registerDisksFromRuntimeConfig({
        default: 'missing',
        drivers: {
          local: { driver: 'local', root: 'storage' } as any,
        },
      } as any)
    ).toThrow(/Storage default disk not configured/i);
  });

  it('throws when default disk is empty', () => {
    StorageDiskRegistry.reset();

    expect(() =>
      registerDisksFromRuntimeConfig({
        default: '',
        drivers: {
          local: { driver: 'local', root: 'storage' } as any,
        },
      } as any)
    ).toThrow(/Storage default disk is not configured/i);
  });
});
