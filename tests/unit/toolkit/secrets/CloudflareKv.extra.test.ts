import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadCloudflareKv = async (env: Record<string, string>) => {
  vi.resetModules();
  vi.doMock('@common/ExternalServiceUtils', async () => {
    const actual = await vi.importActual<typeof import('@common/ExternalServiceUtils')>(
      '@common/ExternalServiceUtils'
    );

    return {
      ...actual,
      readEnvString: vi.fn((key: string, fallback = '') => env[key] ?? fallback),
    };
  });

  const { CloudflareKv } = await import('../../../../src/toolkit/Secrets/providers/CloudflareKv');
  return CloudflareKv;
};

describe('CloudflareKv extra', () => {
  beforeEach(() => {});
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    // @ts-ignore
    delete global.fetch;
  });

  it('doctorEnv reports missing vars when env empty', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: '',
      CLOUDFLARE_API_TOKEN: '',
      CLOUDFLARE_KV_NAMESPACE_ID: '',
    });

    const missing = CloudflareKv.doctorEnv();
    expect(missing).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(missing).toContain('CLOUDFLARE_API_TOKEN');
    expect(missing).toContain('CLOUDFLARE_KV_NAMESPACE_ID');
  });

  it('createFromEnv throws when credentials missing', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: '',
      CLOUDFLARE_API_TOKEN: '',
      CLOUDFLARE_KV_NAMESPACE_ID: '',
    });

    expect(() => CloudflareKv.createFromEnv()).toThrow();
  });

  it('getValue returns null for 404', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_KV_NAMESPACE_ID: 'ns',
    });

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 404, ok: false, text: async () => 'not found' }));

    const inst = CloudflareKv.createFromEnv();
    const v = await inst.getValue('missing');
    expect(v).toBeNull();
  });

  it('getValue returns text on success', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_KV_NAMESPACE_ID: 'ns',
    });

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 200, ok: true, text: async () => 'the-value' }));

    const inst = CloudflareKv.createFromEnv();
    const v = await inst.getValue('key');
    expect(v).toBe('the-value');
  });

  it('getValue throws on non-ok (not 404)', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_KV_NAMESPACE_ID: 'ns',
    });

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 500, ok: false, text: async () => 'err' }));

    const inst = CloudflareKv.createFromEnv();
    await expect(inst.getValue('k')).rejects.toThrow(/Cloudflare KV GET failed \(500\)/);
  });

  it('putValue succeeds and sends headers/body', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_KV_NAMESPACE_ID: 'ns',
    });

    let captured: any = null;
    // @ts-ignore
    global.fetch = vi.fn(async (_url, opts) => {
      captured = opts;
      return { status: 200, ok: true, text: async () => '{}' };
    });

    const inst = CloudflareKv.createFromEnv();
    await inst.putValue('k', 'val');

    expect(captured).toBeTruthy();
    expect(captured.method).toBe('PUT');
    expect(captured.headers.Authorization).toContain('Bearer tok');
    expect(captured.body).toBe('val');
  });

  it('putValue throws on non-ok', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_KV_NAMESPACE_ID: 'ns',
    });

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 403, ok: false, text: async () => 'forbidden' }));

    const inst = CloudflareKv.createFromEnv();
    await expect(inst.putValue('k', 'v')).rejects.toThrow(/Cloudflare KV PUT failed \(403\)/);
  });

  it('getValue accepts explicit namespace when default missing', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_KV_NAMESPACE_ID: '',
    });

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 200, ok: true, text: async () => 'ok' }));

    const inst = CloudflareKv.createFromEnv();
    const v = await inst.getValue('k', 'explicit-ns');
    expect(v).toBe('ok');
  });

  it('getValue throws when namespace missing and not provided', async () => {
    const CloudflareKv = await loadCloudflareKv({
      CLOUDFLARE_ACCOUNT_ID: 'acc',
      CLOUDFLARE_API_TOKEN: 'tok',
      CLOUDFLARE_KV_NAMESPACE_ID: '',
    });

    const inst = CloudflareKv.createFromEnv();
    await expect(inst.getValue('k')).rejects.toThrow(/Cloudflare KV namespace missing/);
  });
});
