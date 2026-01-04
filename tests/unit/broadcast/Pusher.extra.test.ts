import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

describe('PusherDriver branches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // ensure no real fetch escapes tests
    if ((globalThis as any).fetch === undefined) {
      // no-op
    }
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('succeeds when fetch.ok is true and uses default base url for empty cluster', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as any));

    const { PusherDriver } = await import('@broadcast/drivers/Pusher');

    const res = await PusherDriver.send(
      {
        appId: '1',
        key: 'k',
        secret: 's',
        cluster: '',
      } as any,
      'chan',
      'evt',
      { hello: true }
    );

    expect(res.ok).toBe(true);
    // ensure base url used (api.pusherapp.com)
    expect((globalThis.fetch as unknown as Mock).mock.calls[0][0]).toContain('api.pusherapp.com');
  });

  it('throws TRY_CATCH_ERROR when non-ok response with text available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => 'bad' } as any)
    );

    const { PusherDriver } = await import('@broadcast/drivers/Pusher');

    await expect(
      PusherDriver.send({ appId: '1', key: 'k', secret: 's', cluster: 'eu' } as any, 'c', 'e', {
        x: 1,
      })
    ).rejects.toHaveProperty('code', 'TRY_CATCH_ERROR');
  });

  it('throws TRY_CATCH_ERROR when non-ok response and text throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('boom');
        },
      } as any)
    );

    const { PusherDriver } = await import('@broadcast/drivers/Pusher');

    await expect(
      PusherDriver.send({ appId: '1', key: 'k', secret: 's', cluster: 'eu' } as any, 'c', 'e', {
        x: 1,
      })
    ).rejects.toHaveProperty('code', 'TRY_CATCH_ERROR');
  });

  it('throws CONFIG_ERROR when missing appId/key/secret', async () => {
    const { PusherDriver } = await import('@broadcast/drivers/Pusher');

    await expect(
      PusherDriver.send({ appId: '', key: '', secret: '', cluster: '' } as any, 'c', 'e', { x: 1 })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('throws CONFIG_ERROR when key is missing', async () => {
    const { PusherDriver } = await import('@broadcast/drivers/Pusher');

    await expect(
      PusherDriver.send({ appId: '1', key: '', secret: 's', cluster: '' } as any, 'c', 'e', {
        x: 1,
      })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('throws CONFIG_ERROR when secret is missing', async () => {
    const { PusherDriver } = await import('@broadcast/drivers/Pusher');

    await expect(
      PusherDriver.send({ appId: '1', key: 'k', secret: '', cluster: '' } as any, 'c', 'e', {
        x: 1,
      })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });
});
