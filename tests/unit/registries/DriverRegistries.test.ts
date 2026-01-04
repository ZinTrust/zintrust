import { CacheDriverRegistry } from '@cache/CacheDriverRegistry';
import { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
import { StorageDriverRegistry } from '@storage/StorageDriverRegistry';
import { MailDriverRegistry } from '@tools/mail/MailDriverRegistry';
import { describe, expect, it, vi } from 'vitest';

describe('Driver registries', () => {
  it('CacheDriverRegistry supports register/has/list/get', () => {
    const factory = vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
    })) as any;

    CacheDriverRegistry.register('redis' as any, factory);

    expect(CacheDriverRegistry.has('redis' as any)).toBe(true);
    expect(CacheDriverRegistry.list()).toContain('redis' as any);
    expect(CacheDriverRegistry.get('redis' as any)).toBe(factory);
  });

  it('DatabaseAdapterRegistry supports register/has/list/get', () => {
    const factory = vi.fn(() => ({})) as any;

    DatabaseAdapterRegistry.register('sqlite' as any, factory);

    expect(DatabaseAdapterRegistry.has('sqlite' as any)).toBe(true);
    expect(DatabaseAdapterRegistry.list()).toContain('sqlite' as any);
    expect(DatabaseAdapterRegistry.get('sqlite' as any)).toBe(factory);
  });

  it('MailDriverRegistry supports register/has/list/get', () => {
    const handler = vi.fn(async () => ({ ok: true, messageId: 'x' }));

    MailDriverRegistry.register('test-driver', handler);

    expect(MailDriverRegistry.has('test-driver')).toBe(true);
    expect(MailDriverRegistry.list()).toContain('test-driver');
    expect(MailDriverRegistry.get('test-driver')).toBe(handler);
  });

  it('StorageDriverRegistry supports register/has/list/get', () => {
    const entry = { driver: { put: vi.fn() } } as any;

    StorageDriverRegistry.register('s3', entry);

    expect(StorageDriverRegistry.has('s3')).toBe(true);
    expect(StorageDriverRegistry.list()).toContain('s3');
    expect(StorageDriverRegistry.get('s3')).toBe(entry);
  });
});
