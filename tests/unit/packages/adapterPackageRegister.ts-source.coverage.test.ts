import { describe, expect, it, vi } from 'vitest';

// These tests intentionally import the TypeScript source entrypoints (not the `.js` specifiers)
// so V8 coverage attributes lines to the adapter package sources.

describe('adapter packages /register (TS source coverage)', () => {
  it('registers cache mongodb (register.ts)', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    expect(core.CacheDriverRegistry.has('mongodb')).toBe(false);
    await import('../../../packages/cache-mongodb/src/register');
    expect(core.CacheDriverRegistry.has('mongodb')).toBe(true);
  });

  it('registers queue redis (register.ts)', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    core.Queue.reset();
    expect(() => core.Queue.get('redis')).toThrow();

    await import('../../../packages/queue-redis/src/register');
    expect(() => core.Queue.get('redis')).not.toThrow();
  });

  it('registers storage s3/r2/gcs (register.ts)', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    expect(core.StorageDriverRegistry.has('s3')).toBe(false);
    expect(core.StorageDriverRegistry.has('r2')).toBe(false);
    expect(core.StorageDriverRegistry.has('gcs')).toBe(false);

    await import('../../../packages/storage-s3/src/register');
    await import('../../../packages/storage-r2/src/register');
    await import('../../../packages/storage-gcs/src/register');

    expect(core.StorageDriverRegistry.has('s3')).toBe(true);
    expect(core.StorageDriverRegistry.has('r2')).toBe(true);
    expect(core.StorageDriverRegistry.has('gcs')).toBe(true);
  });

  it('registers mail smtp/sendgrid/mailgun (register.ts)', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    core.MailDriverRegistry.reset();
    expect(core.MailDriverRegistry.has('smtp')).toBe(false);
    expect(core.MailDriverRegistry.has('sendgrid')).toBe(false);
    expect(core.MailDriverRegistry.has('mailgun')).toBe(false);

    await import('../../../packages/mail-smtp/src/register');
    await import('../../../packages/mail-sendgrid/src/register');
    await import('../../../packages/mail-mailgun/src/register');

    expect(core.MailDriverRegistry.has('smtp')).toBe(true);
    expect(core.MailDriverRegistry.has('sendgrid')).toBe(true);
    expect(core.MailDriverRegistry.has('mailgun')).toBe(true);
  });
});
