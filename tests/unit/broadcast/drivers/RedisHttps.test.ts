import { RedisHttpsDriver } from '@broadcast/drivers/RedisHttps';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RedisHttpsDriver (Broadcast)', () => {
  beforeEach(() => {
    process.env['REDIS_HTTPS_TIMEOUT'] = '5000';
    vi.restoreAllMocks();
  });

  it('posts PUBLISH command to proxy endpoint', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://redis-proxy.example.com');
      expect(init?.method).toBe('POST');

      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(String(init?.body ?? '')) as Record<string, unknown>;
      expect(body['command']).toBe('PUBLISH');
      expect(body['channel']).toBe('broadcast:orders');
      expect(body['message']).toBe(JSON.stringify({ event: 'created', data: { id: 123 } }));

      return new Response('1', { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const res = await RedisHttpsDriver.send(
      {
        driver: 'redishttps',
        endpoint: 'https://redis-proxy.example.com',
        token: 'test-token',
        channelPrefix: 'broadcast:',
      },
      'orders',
      'created',
      { id: 123 }
    );

    expect(res.ok).toBe(true);
    expect(res.published).toBe(1);
  });

  it('throws config error when endpoint missing', async () => {
    await expect(
      RedisHttpsDriver.send(
        {
          driver: 'redishttps',
          endpoint: '',
          token: 't',
          channelPrefix: 'broadcast:',
        },
        'orders',
        'created',
        { id: 1 }
      )
    ).rejects.toThrow('REDIS_HTTPS_ENDPOINT');
  });

  it('throws config error when token missing', async () => {
    await expect(
      RedisHttpsDriver.send(
        {
          driver: 'redishttps',
          endpoint: 'https://redis-proxy.example.com',
          token: '',
          channelPrefix: 'broadcast:',
        },
        'orders',
        'created',
        { id: 1 }
      )
    ).rejects.toThrow('REDIS_HTTPS_TOKEN');
  });
});
