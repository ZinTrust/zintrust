import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudflareKv } from '../../../../src/toolkit/Secrets/providers/CloudflareKv';

describe('CloudflareKv extra', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {});
  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.restoreAllMocks();
    // @ts-ignore
    delete global.fetch;
  });

  it('doctorEnv reports missing vars when env empty', () => {
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['CLOUDFLARE_API_TOKEN'];
    delete process.env['CLOUDFLARE_KV_NAMESPACE_ID'];

    const missing = CloudflareKv.doctorEnv();
    expect(missing).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(missing).toContain('CLOUDFLARE_API_TOKEN');
    expect(missing).toContain('CLOUDFLARE_KV_NAMESPACE_ID');
  });

  it('createFromEnv throws when credentials missing', () => {
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['CLOUDFLARE_API_TOKEN'];

    expect(() => CloudflareKv.createFromEnv()).toThrow();
  });

  it('getValue returns null for 404', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_API_TOKEN'] = 'tok';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 404, ok: false, text: async () => 'not found' }));

    const inst = CloudflareKv.createFromEnv();
    const v = await inst.getValue('missing');
    expect(v).toBeNull();
  });

  it('getValue returns text on success', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_API_TOKEN'] = 'tok';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 200, ok: true, text: async () => 'the-value' }));

    const inst = CloudflareKv.createFromEnv();
    const v = await inst.getValue('key');
    expect(v).toBe('the-value');
  });

  it('getValue throws on non-ok (not 404)', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_API_TOKEN'] = 'tok';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 500, ok: false, text: async () => 'err' }));

    const inst = CloudflareKv.createFromEnv();
    await expect(inst.getValue('k')).rejects.toThrow(/Cloudflare KV GET failed \(500\)/);
  });

  it('putValue succeeds and sends headers/body', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_API_TOKEN'] = 'tok';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

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
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_API_TOKEN'] = 'tok';
    process.env['CLOUDFLARE_KV_NAMESPACE_ID'] = 'ns';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 403, ok: false, text: async () => 'forbidden' }));

    const inst = CloudflareKv.createFromEnv();
    await expect(inst.putValue('k', 'v')).rejects.toThrow(/Cloudflare KV PUT failed \(403\)/);
  });

  it('getValue accepts explicit namespace when default missing', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_API_TOKEN'] = 'tok';
    delete process.env['CLOUDFLARE_KV_NAMESPACE_ID'];

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ status: 200, ok: true, text: async () => 'ok' }));

    const inst = CloudflareKv.createFromEnv();
    const v = await inst.getValue('k', 'explicit-ns');
    expect(v).toBe('ok');
  });

  it('getValue throws when namespace missing and not provided', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_API_TOKEN'] = 'tok';
    delete process.env['CLOUDFLARE_KV_NAMESPACE_ID'];

    const inst = CloudflareKv.createFromEnv();
    await expect(inst.getValue('k')).rejects.toThrow(/Cloudflare KV namespace missing/);
  });
});
