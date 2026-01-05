import { StorageDiskRegistry } from '@storage/StorageDiskRegistry';
import { beforeEach, describe, expect, it } from 'vitest';

describe('StorageDiskRegistry patch coverage', () => {
  beforeEach(() => {
    StorageDiskRegistry.reset();
  });

  it('throws when disk not registered', () => {
    expect(() => StorageDiskRegistry.get('missing')).toThrow(/not registered/i);
  });

  it('lists disks sorted', () => {
    StorageDiskRegistry.register('B', { driver: 'local' } as any);
    StorageDiskRegistry.register('a', { driver: 'local' } as any);

    expect(StorageDiskRegistry.list()).toEqual(['a', 'b']);
  });
});
