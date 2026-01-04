import { AwsSecretsManager } from '@/toolkit/Secrets/providers/AwsSecretsManager';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AwsSecretsManager extra', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {});

  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.restoreAllMocks();
    // @ts-ignore
    delete global.fetch;
  });

  it('doctorEnv reports missing vars when env is empty', () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    const missing = AwsSecretsManager.doctorEnv();
    expect(missing).toContain('AWS_REGION');
    expect(missing).toContain('AWS_ACCESS_KEY_ID');
    expect(missing).toContain('AWS_SECRET_ACCESS_KEY');
  });

  it('createFromEnv throws when credentials missing', () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    expect(() => AwsSecretsManager.createFromEnv()).toThrowError();
  });

  it('getValue returns null when SecretString absent', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ACCESS_KEY_ID = 'AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'SK';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    }));

    const sm = AwsSecretsManager.createFromEnv();
    const v = await sm.getValue('mysecret');
    expect(v).toBeNull();
  });

  it('getValue returns plain secret string', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ACCESS_KEY_ID = 'AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'SK';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ SecretString: 'plain' }),
    }));

    const sm = AwsSecretsManager.createFromEnv();
    const v = await sm.getValue('s');
    expect(v).toBe('plain');
  });

  it('getValue with jsonKey returns nested string or json stringified', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ACCESS_KEY_ID = 'AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'SK';

    // string value
    // @ts-ignore
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ SecretString: JSON.stringify({ foo: 'bar' }) }),
    }));
    const sm1 = AwsSecretsManager.createFromEnv();
    const v1 = await sm1.getValue('s', 'foo');
    expect(v1).toBe('bar');

    // object value
    // @ts-ignore
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ SecretString: JSON.stringify({ foo: { a: 1 } }) }),
    }));
    const sm2 = AwsSecretsManager.createFromEnv();
    const v2 = await sm2.getValue('s', 'foo');
    expect(v2).toBe(JSON.stringify({ a: 1 }));

    // missing key
    // @ts-ignore
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ SecretString: JSON.stringify({}) }),
    }));
    const sm3 = AwsSecretsManager.createFromEnv();
    const v3 = await sm3.getValue('s', 'nope');
    expect(v3).toBeNull();
  });

  it('getValue throws when request fails (non-ok)', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ACCESS_KEY_ID = 'AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'SK';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }));

    const sm = AwsSecretsManager.createFromEnv();
    await expect(sm.getValue('s')).rejects.toThrow(/AWS SecretsManager request failed \(500\)/);
  });

  it('putValue sends Authorization and session token when present', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ACCESS_KEY_ID = 'AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'SK';
    process.env.AWS_SESSION_TOKEN = 'SESSION123';

    let captured: any = null;
    // @ts-ignore
    global.fetch = vi.fn(async (_url, opts) => {
      captured = opts;
      return { ok: true, status: 200, text: async () => JSON.stringify({}) };
    });

    const sm = AwsSecretsManager.createFromEnv();
    await sm.putValue('s', 'the-value');

    expect(captured).toBeTruthy();
    expect(captured.headers['x-amz-security-token']).toBe('SESSION123');
    expect(typeof captured.headers['Authorization']).toBe('string');
    expect(captured.body).toContain('the-value');
  });

  it('putValue throws when request fails', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ACCESS_KEY_ID = 'AK';
    process.env.AWS_SECRET_ACCESS_KEY = 'SK';

    // @ts-ignore
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'fail' }));

    const sm = AwsSecretsManager.createFromEnv();
    await expect(sm.putValue('s', 'v')).rejects.toThrow(
      /AWS SecretsManager request failed \(500\)/
    );
  });
});
