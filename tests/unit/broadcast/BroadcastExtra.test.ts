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
vi.mock('@tools/broadcast/drivers/InMemory', () => ({
  InMemoryDriver: { send: vi.fn() },
}));
vi.mock('@tools/broadcast/drivers/Pusher', () => ({
  PusherDriver: { send: vi.fn() },
}));
vi.mock('@tools/broadcast/drivers/Redis', () => ({
  RedisDriver: { send: vi.fn() },
}));
vi.mock('@tools/broadcast/drivers/RedisHttps', () => ({
  RedisHttpsDriver: { send: vi.fn() },
}));

import { ErrorFactory } from '@exceptions/ZintrustError';
import { InMemoryDriver } from '@tools/broadcast/drivers/InMemory';
import { PusherDriver } from '@tools/broadcast/drivers/Pusher';

describe('Broadcast dispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates to InMemoryDriver when driver is inmemory', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('inmemory');
    (InMemoryDriver.send as vi.Mock).mockResolvedValue({ ok: true });

    const res = await Broadcast.send('ch', 'ev', { a: 1 });
    expect(InMemoryDriver.send).toHaveBeenCalledWith(undefined, 'ch', 'ev', { a: 1 });
    expect(res).toEqual({ ok: true });
  });

  it('throws CONFIG_ERROR when pusher config mismatch', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('pusher');
    (broadcastConfig as any).getDriverConfig.mockReturnValue({ driver: 'redis' } as any);

    await expect(Broadcast.send('ch', 'ev', {})).rejects.toEqual(
      ErrorFactory.createConfigError('Broadcast driver config mismatch: expected pusher')
    );
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

  it('throws CONFIG_ERROR when redis config mismatch', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('redis');
    (broadcastConfig as any).getDriverConfig.mockReturnValue({ driver: 'pusher' } as any);

    await expect(Broadcast.send('ch', 'ev', {})).rejects.toEqual(
      ErrorFactory.createConfigError('Broadcast driver config mismatch: expected redis')
    );
  });

  it('throws CONFIG_ERROR when redishttps config mismatch', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('redishttps');
    (broadcastConfig as any).getDriverConfig.mockReturnValue({ driver: 'redis' } as any);

    await expect(Broadcast.send('ch', 'ev', {})).rejects.toEqual(
      ErrorFactory.createConfigError('Broadcast driver config mismatch: expected redishttps')
    );
  });

  it('throws CONFIG_ERROR when driver not implemented', async () => {
    (broadcastConfig as any).getDriverName.mockReturnValue('customdriver');

    await expect(Broadcast.send('ch', 'ev', {})).rejects.toEqual(
      ErrorFactory.createConfigError('Broadcast driver not implemented: customdriver')
    );
  });
});
