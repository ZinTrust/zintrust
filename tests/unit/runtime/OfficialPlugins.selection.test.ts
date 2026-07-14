import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackedEnvKeys = [
  'BACKUP_DRIVER',
  'BROADCAST_CONNECTION',
  'BROADCAST_DRIVER',
  'CACHE_CONNECTION',
  'CACHE_DRIVER',
  'DB_CONNECTION',
  'DB_DATABASE',
  'DB_PATH',
  'MAIL_CONNECTION',
  'MAIL_DRIVER',
  'QUEUE_DRIVER',
  'QUEUE_CONNECTION',
  'QUEUE_MONITOR_ENABLED',
  'SOCKET_ENABLED',
  'STORAGE_CONNECTION',
  'STORAGE_DRIVER',
  'WORKER_ENABLED',
] as const;

const originalEnv = new Map<string, string | undefined>();

const restoreTrackedEnv = (): void => {
  for (const key of trackedEnvKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
      continue;
    }

    process.env[key] = value;
  }
};

describe('OfficialPlugins selection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    for (const key of trackedEnvKeys) {
      originalEnv.set(key, process.env[key]);
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    restoreTrackedEnv();
  });

  it('skips base auto-imports when optional features are not explicitly enabled', async () => {
    const { OfficialPlugins } = await import('@/runtime/OfficialPlugins');

    expect(OfficialPlugins.getAutoImports('base')).toEqual([]);
    expect(OfficialPlugins.getPackages('base')).toEqual([]);
  });

  it('returns only explicitly selected optional plugin imports', async () => {
    process.env['DB_CONNECTION'] = 'mysql';
    process.env['QUEUE_DRIVER'] = 'redis';
    process.env['CACHE_DRIVER'] = 'redis';
    process.env['MAIL_DRIVER'] = 'smtp';
    process.env['STORAGE_DRIVER'] = 's3';
    process.env['SOCKET_ENABLED'] = 'true';
    process.env['WORKER_ENABLED'] = 'true';

    const { OfficialPlugins } = await import('@/runtime/OfficialPlugins');

    expect(OfficialPlugins.getAutoImports('base')).toEqual(
      expect.arrayContaining([
        '@zintrust/db-mysql/register',
        '@zintrust/queue-redis/register',
        '@zintrust/cache-redis/register',
        '@zintrust/mail-smtp/register',
        '@zintrust/storage-s3/register',
        '@zintrust/socket/register',
      ])
    );
    expect(OfficialPlugins.getAutoImports('base')).not.toContain('@zintrust/db-postgres/register');
    expect(OfficialPlugins.getPackages('worker')).toEqual(
      expect.arrayContaining(['@zintrust/workers'])
    );
    expect(OfficialPlugins.getAutoImports('worker')).toEqual(
      expect.arrayContaining(['@zintrust/workers/register'])
    );
  });

  it('selects Cloudflare Queues when requested as the queue driver', async () => {
    process.env['QUEUE_DRIVER'] = 'cloudflare';

    const { OfficialPlugins } = await import('@/runtime/OfficialPlugins');

    expect(OfficialPlugins.getPackages('base')).toContain('@zintrust/queue-cloudflare');
    expect(OfficialPlugins.getAutoImports('base')).toContain('@zintrust/queue-cloudflare/register');
  });

  it('selects Zedgi when requested as the queue connection', async () => {
    process.env['QUEUE_CONNECTION'] = 'queue-zedgi';
    process.env['QUEUE_DRIVER'] = 'redis';

    const { OfficialPlugins } = await import('@/runtime/OfficialPlugins');

    expect(OfficialPlugins.getPackages('base')).toContain('@zintrust/zedgi');
    expect(OfficialPlugins.getAutoImports('base')).toContain('@zintrust/zedgi/register');
    expect(OfficialPlugins.getPackages('base')).not.toContain('@zintrust/queue-redis');
  });
});
