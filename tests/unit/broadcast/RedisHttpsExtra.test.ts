import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorFactory } from '../../../src/exceptions/ZintrustError';
import RedisHttpsDriver from '../../../src/tools/broadcast/drivers/RedisHttps';
let mockedResponse: any;

vi.mock('@/tools/http/Http', () => ({
  HttpClient: {
    post: () => ({
      withAuth: () => ({
        withTimeout: () => ({
          send: async () => mockedResponse,
        }),
      }),
    }),
  },
}));

import { HttpClient } from '@/tools/http/Http';

describe('RedisHttpsDriver extra branches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedResponse = undefined;
  });

  it('throws CONFIG_ERROR when endpoint is missing', async () => {
    const cfg: any = { driver: 'redishttps', endpoint: ' ', token: 'tok', channelPrefix: 'bp:' };

    await expect(RedisHttpsDriver.send(cfg, 'ch', 'ev', {})).rejects.toEqual(
      ErrorFactory.createConfigError('Redis HTTPS broadcast driver requires REDIS_HTTPS_ENDPOINT')
    );
  });

  it('throws CONFIG_ERROR when token is missing', async () => {
    const cfg: any = {
      driver: 'redishttps',
      endpoint: 'https://localhost',
      token: ' ',
      channelPrefix: 'bp:',
    };

    await expect(RedisHttpsDriver.send(cfg, 'ch', 'ev', {})).rejects.toEqual(
      ErrorFactory.createConfigError('Redis HTTPS broadcast driver requires REDIS_HTTPS_TOKEN')
    );
  });

  it('throws TRY_CATCH_ERROR when payload cannot be serialized', async () => {
    const cfg: any = {
      driver: 'redishttps',
      endpoint: 'https://localhost',
      token: 'tok',
      channelPrefix: 'bp:',
    };

    const cyclic: any = { self: null };
    cyclic.self = cyclic;

    await expect(RedisHttpsDriver.send(cfg, 'ch', 'ev', cyclic)).rejects.toEqual(
      ErrorFactory.createTryCatchError('Failed to serialize broadcast payload', expect.any(Error))
    );
  });

  it('parses published number when response body is numeric', async () => {
    const cfg: any = {
      driver: 'redishttps',
      endpoint: 'https://localhost',
      token: 'tok',
      channelPrefix: 'bp:',
    };

    const response = {
      body: ' 1 ',
      throwIfServerError: () => {},
      throwIfClientError: () => {},
    };

    vi.spyOn(HttpClient, 'post' as any).mockImplementation(() => ({
      withAuth: () => ({
        withTimeout: () => ({
          send: async () => response,
        }),
      }),
    }));

    const res = await RedisHttpsDriver.send(cfg, 'ch', 'ev', { a: 1 });
    expect(res).toEqual({ ok: true, published: 1 });
  });

  it('returns published undefined when body is non-numeric', async () => {
    const cfg: any = {
      driver: 'redishttps',
      endpoint: 'https://localhost',
      token: 'tok',
      channelPrefix: 'bp:',
    };

    const response = {
      body: 'ok',
      throwIfServerError: () => {},
      throwIfClientError: () => {},
    };

    vi.spyOn(HttpClient, 'post' as any).mockImplementation(() => ({
      withAuth: () => ({
        withTimeout: () => ({
          send: async () => response,
        }),
      }),
    }));

    const res = await RedisHttpsDriver.send(cfg, 'ch', 'ev', { a: 1 });
    expect(res).toEqual({ ok: true, published: undefined });
  });
});
