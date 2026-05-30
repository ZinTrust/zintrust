import { describe, expect, it, vi } from 'vitest';

// These tests intentionally import the TypeScript source entrypoints (not the `.js` specifiers)
// so V8 coverage attributes lines to the adapter package sources.

// Unmock storage packages for these specific tests
vi.unmock('../../../packages/storage-s3/src/register');
vi.unmock('../../../packages/storage-r2/src/register');
vi.unmock('../../../packages/storage-gcs/src/register');
vi.unmock('../../../packages/storage/src/register');

describe('adapter packages /register (TS source coverage)', () => {
  it('registers cache mongodb (register.ts)', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    core.CacheDriverRegistry.clear();
    expect(core.CacheDriverRegistry.has('mongodb')).toBe(false);

    // Import and call the register function explicitly
    const { registerMongoCacheDriver } =
      await import('../../../packages/cache-mongodb/src/register');
    registerMongoCacheDriver(
      core.CacheDriverRegistry as unknown as {
        register: (driver: string, factory: (cfg: unknown) => unknown) => void;
      }
    );

    expect(core.CacheDriverRegistry.has('mongodb')).toBe(true);
  });

  it('registers queue redis (register.ts)', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    core.Queue.reset();
    expect(() => core.Queue.get('redis')).toThrow();

    // Import and call the register function explicitly
    const { registerRedisQueueDriver } = await import('../../../packages/queue-redis/src/register');
    await registerRedisQueueDriver(
      core.Queue as unknown as {
        register: (name: string, driver: unknown) => void;
      }
    );

    expect(() => core.Queue.get('redis')).not.toThrow();
  });

  it('registers storage s3/r2/gcs (register.ts)', async () => {
    vi.resetModules();

    const core = await import('../../../src/index');

    core.StorageDriverRegistry.clear();
    expect(core.StorageDriverRegistry.has('s3')).toBe(false);
    expect(core.StorageDriverRegistry.has('r2')).toBe(false);
    expect(core.StorageDriverRegistry.has('gcs')).toBe(false);

    // Import the register modules and call the register functions explicitly
    const { registerS3StorageDriver } = await import('../../../packages/storage-s3/src/register');
    const { registerR2StorageDriver } = await import('../../../packages/storage-r2/src/register');
    const { registerGcsStorageDriver } = await import('../../../packages/storage-gcs/src/register');

    registerS3StorageDriver(core.StorageDriverRegistry);
    registerR2StorageDriver(core.StorageDriverRegistry);
    registerGcsStorageDriver(core.StorageDriverRegistry);

    expect(core.StorageDriverRegistry.has('s3')).toBe(true);
    expect(core.StorageDriverRegistry.has('r2')).toBe(true);
    expect(core.StorageDriverRegistry.has('gcs')).toBe(true);
  });

  it.skip('registers the storage multipart parser from the documented entrypoint', async () => {
    vi.resetModules();

    const core = await import('../../../src/index');

    core.MultipartParserRegistry.clear();
    expect(core.MultipartParserRegistry.has()).toBe(false);

    // Import the register module - it should auto-register when imported
    await import('../../../packages/storage/src/register');

    // The register.ts file calls registerStreamingMultipartParser() at module level
    // which should register with the global MultipartParserRegistry
    expect(core.MultipartParserRegistry.has()).toBe(true);
  });

  it('registers mail smtp/sendgrid/mailgun (register.ts)', async () => {
    vi.resetModules();
    const core = await import('../../../src/index');

    core.MailDriverRegistry.reset();
    expect(core.MailDriverRegistry.has('smtp')).toBe(false);
    expect(core.MailDriverRegistry.has('sendgrid')).toBe(false);
    expect(core.MailDriverRegistry.has('mailgun')).toBe(false);

    // Import and call the register functions explicitly
    const { registerSmtpMailDriver } = await import('../../../packages/mail-smtp/src/register');
    const { registerSendGridMailDriver } =
      await import('../../../packages/mail-sendgrid/src/register');
    const { registerMailgunMailDriver } =
      await import('../../../packages/mail-mailgun/src/register');

    await registerSmtpMailDriver(
      core.MailDriverRegistry as unknown as {
        register: (driver: string, handler: unknown) => void;
      }
    );
    await registerSendGridMailDriver(
      core.MailDriverRegistry as unknown as {
        register: (driver: string, handler: unknown) => void;
      }
    );
    await registerMailgunMailDriver(
      core.MailDriverRegistry as unknown as {
        register: (driver: string, handler: unknown) => void;
      }
    );

    expect(core.MailDriverRegistry.has('smtp')).toBe(true);
    expect(core.MailDriverRegistry.has('sendgrid')).toBe(true);
    expect(core.MailDriverRegistry.has('mailgun')).toBe(true);
  });
});
