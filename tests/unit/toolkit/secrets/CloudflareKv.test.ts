import { CloudflareKv } from '@/toolkit/Secrets/providers/CloudflareKv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OLD_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
  vi.restoreAllMocks();
});

describe('CloudflareKv', () => {
  it('doctorEnv reports missing vars', () => {
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['CLOUDFLARE_API_TOKEN'];
    delete process.env['CLOUDFLARE_KV_NAMESPACE_ID'];

    const missing = CloudflareKv.doctorEnv();
    expect(missing).toEqual(
      expect.arrayContaining([
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_KV_NAMESPACE_ID',
      ])
    );
  });

  it('createFromEnv throws when missing credentials', () => {
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['CLOUDFLARE_API_TOKEN'];

    expect(() => CloudflareKv.createFromEnv()).toThrow();
  });

  it('getValue returns null on 404', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acct';
    process.env['CLOUDFLARE_API_TOKEN'] = 'token';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 404, ok: false, text: async () => 'not found' }));

    const kv = CloudflareKv.createFromEnv();
    const val = await kv.getValue('key');
    expect(val).toBeNull();
  });

  it('getValue throws on non-ok', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acct';
    process.env['CLOUDFLARE_API_TOKEN'] = 'token';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 500, ok: false, text: async () => 'err' }));

    const kv = CloudflareKv.createFromEnv();
    await expect(kv.getValue('key')).rejects.toBeDefined();
  });

  it('putValue throws on non-ok and succeeds on ok', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acct';
    process.env['CLOUDFLARE_API_TOKEN'] = 'token';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
    // @ts-ignore
    global.fetch = fetchMock;

    const kv = CloudflareKv.createFromEnv();
    await expect(kv.putValue('k', 'v')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();

    // now non-ok
    // @ts-ignore
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'err' }));
    await expect(kv.putValue('k', 'v')).rejects.toBeDefined();
  });
});
