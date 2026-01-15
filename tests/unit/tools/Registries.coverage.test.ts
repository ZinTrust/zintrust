import { NotificationChannelRegistry } from '@tools/notification/NotificationChannelRegistry';
import { StorageDiskRegistry } from '@tools/storage/StorageDiskRegistry';
import { StorageDriverRegistry } from '@tools/storage/StorageDriverRegistry';
import { describe, expect, it } from 'vitest';

describe('registry coverage', () => {
  it('handles notification channel registry', () => {
    NotificationChannelRegistry.reset();
    NotificationChannelRegistry.register('  ', { driver: 'inmemory' } as any);
    expect(NotificationChannelRegistry.has('inmemory')).toBe(false);

    NotificationChannelRegistry.register('sms', { driver: 'inmemory' } as any);
    expect(NotificationChannelRegistry.has('sms')).toBe(true);
    expect(NotificationChannelRegistry.get('sms')).toBeDefined();
  });

  it('handles storage disk registry', () => {
    StorageDiskRegistry.reset();
    StorageDiskRegistry.register('  ', { driver: 'local' });
    expect(StorageDiskRegistry.has('local')).toBe(false);

    StorageDiskRegistry.register('local', { driver: 'local' });
    expect(StorageDiskRegistry.get('local')).toBeDefined();
  });

  it('handles storage driver registry', () => {
    StorageDriverRegistry.register('local', { driver: { name: 'local' } });
    expect(StorageDriverRegistry.has('local')).toBe(true);
    expect(StorageDriverRegistry.get('local')).toBeDefined();
  });
});
