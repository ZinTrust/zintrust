import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@config/broadcast', () => {
  const getDriverName = vi.fn();
  const getDriverConfig = vi.fn();
  return {
    default: {
      getDriverName,
      getDriverConfig,
    },
  };
});

import broadcastConfig from '@config/broadcast';
import Broadcast from '@tools/broadcast/Broadcast';
vi.mock('@broadcast/drivers/InMemory', () => ({
  InMemoryDriver: { send: vi.fn() },
}));
vi.mock('@broadcast/drivers/Pusher', () => ({
  PusherDriver: { send: vi.fn() },
}));
vi.mock('@broadcast/drivers/Redis', () => ({
  RedisDriver: { send: vi.fn() },
}));
vi.mock('@broadcast/drivers/RedisHttps', () => ({
  RedisHttpsDriver: { send: vi.fn() },
}));

import { InMemoryDriver } from '@broadcast/drivers/InMemory';
import { PusherDriver } from '@broadcast/drivers/Pusher';
import { RedisDriver } from '@broadcast/drivers/Redis';
import { ErrorFactory } from '@exceptions/ZintrustError';

describe('Broadcast dispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates to InMemoryDriver when driver is inmemory', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('inmemory');
    (broadcastConfig as any).getDriverConfig.mockReturnValue({ driver: 'inmemory' } as any);
    (InMemoryDriver.send as vi.Mock).mockResolvedValue({ ok: true });

    const res = await Broadcast.send('ch', 'ev', { a: 1 });
    expect(InMemoryDriver.send).toHaveBeenCalledWith(undefined, 'ch', 'ev', { a: 1 });
    expect(res).toEqual({ ok: true });
  });

  it('routes by config.driver when name differs', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('pusher');
    (broadcastConfig as any).getDriverConfig.mockReturnValue({ driver: 'redis' } as any);

    (RedisDriver.send as vi.Mock).mockResolvedValue({ ok: true, provider: 'redis' } as any);

    const res = await Broadcast.send('ch', 'ev', {});
    expect(RedisDriver.send).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, provider: 'redis' });
  });

  it('delegates to PusherDriver when config matches', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('pusher');
    const cfg = { driver: 'pusher' } as any;
    (broadcastConfig as any).getDriverConfig.mockReturnValue(cfg);
    (PusherDriver.send as vi.Mock).mockResolvedValue({ ok: true, sent: 'yes' } as any);

    const res = await Broadcast.send('ch', 'ev', { b: 2 });
    expect(PusherDriver.send).toHaveBeenCalledWith(cfg, 'ch', 'ev', { b: 2 });
    expect(res).toEqual({ ok: true, sent: 'yes' });
  });

  it('throws CONFIG_ERROR when driver not implemented', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('customdriver');
    (broadcastConfig as any).getDriverConfig.mockReturnValue({ driver: 'customdriver' } as any);

    await expect(Broadcast.send('ch', 'ev', {})).rejects.toEqual(
      ErrorFactory.createConfigError('Broadcast driver not implemented: customdriver')
    );
  });
});
