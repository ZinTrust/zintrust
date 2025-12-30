import { PusherDriver } from '@broadcast/drivers/Pusher';
import { createHash, createHmac } from '@node-singletons/crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PusherDriver', () => {
  const originalNow = Date.now;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Date.now = originalNow;
  });

  it('signs request and calls fetch', async () => {
    Date.now = () => 1700000000000; // fixed

    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })) as any;
    (globalThis as any).fetch = fetchMock;

    const config = {
      driver: 'pusher' as const,
      appId: '123',
      key: 'key_abc',
      secret: 'secret_xyz',
      cluster: 'eu',
      useTLS: true,
    };

    await PusherDriver.send(config, 'my-channel', 'MyEvent', { a: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('https://api-eu.pusher.com/apps/123/events?');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');

    const body = String(init.body);
    const bodyMd5 = createHash('md5').update(body).digest('hex');

    const authTimestamp = String(Math.floor(Date.now() / 1000));
    const queryString = [
      `auth_key=${encodeURIComponent(config.key)}`,
      `auth_timestamp=${encodeURIComponent(authTimestamp)}`,
      `auth_version=1.0`,
      `body_md5=${encodeURIComponent(bodyMd5)}`,
    ].join('&');

    const stringToSign = `POST\n/apps/${config.appId}/events\n${queryString}`;
    const expectedSig = createHmac('sha256', config.secret).update(stringToSign).digest('hex');

    expect(String(url)).toContain(`${queryString}&auth_signature=${expectedSig}`);
  });

  it('throws config error when required values missing', async () => {
    const config = {
      driver: 'pusher' as const,
      appId: '',
      key: '',
      secret: '',
      cluster: '',
      useTLS: true,
    };

    await expect(PusherDriver.send(config, 'ch', 'Ev', {})).rejects.toBeTruthy();
  });
});
