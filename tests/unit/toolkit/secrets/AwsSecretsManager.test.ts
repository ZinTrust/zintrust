import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AwsSecretsManager } from '@/toolkit/Secrets/providers/AwsSecretsManager';

const OLD_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  process.env = OLD_ENV;
  vi.restoreAllMocks();
});

describe('AwsSecretsManager', () => {
  it('doctorEnv reports missing vars', () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    const missing = AwsSecretsManager.doctorEnv();
    // Note: AWS_REGION has a default value in Env object, so it won't be reported as missing
    expect(missing).toEqual(expect.arrayContaining(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']));
  });

  it('createFromEnv throws when credentials missing', () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    expect(() => AwsSecretsManager.createFromEnv()).toThrow();
  });

  it('getValue returns null when SecretString missing', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ACCESS_KEY_ID = 'ak';
    process.env.AWS_SECRET_ACCESS_KEY = 'sk';

    // mock fetch to return { SecretString: undefined }
    // @ts-ignore
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    }));

    const svc = AwsSecretsManager.createFromEnv();
    const val = await svc.getValue('id');
    expect(val).toBeNull();
  });

  it('getValue returns secret string and parses json key', async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'ak';
    process.env.AWS_SECRET_ACCESS_KEY = 'sk';

    const secretObj = { foo: 'bar', nested: { x: 1 } };
    // @ts-ignore
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ SecretString: JSON.stringify(secretObj) }),
    }));

    const svc = AwsSecretsManager.createFromEnv();
    const all = await svc.getValue('id');
    expect(all).toBe(JSON.stringify(secretObj)); // when no jsonKey, returns string

    const foo = await svc.getValue('id', 'foo');
    expect(foo).toBe('bar');

    const nested = await svc.getValue('id', 'nested');
    expect(nested).toBe(JSON.stringify(secretObj.nested));

    const missing = await svc.getValue('id', 'nope');
    expect(missing).toBeNull();
  });

  it('getValue throws when request not ok', async () => {
    process.env.AWS_REGION = 'us-west-2';
    process.env.AWS_ACCESS_KEY_ID = 'ak';
    process.env.AWS_SECRET_ACCESS_KEY = 'sk';

    // non-ok response
    // @ts-ignore
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'err' }));

    const svc = AwsSecretsManager.createFromEnv();
    await expect(svc.getValue('id')).rejects.toBeDefined();
  });

  it('putValue calls API and does not throw on ok', async () => {
    process.env.AWS_REGION = 'us-west-2';
    process.env.AWS_ACCESS_KEY_ID = 'ak';
    process.env.AWS_SECRET_ACCESS_KEY = 'sk';

    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
    // @ts-ignore
    globalThis.fetch = fetchMock;

    const svc = AwsSecretsManager.createFromEnv();
    await expect(svc.putValue('id', 'value')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });
});
