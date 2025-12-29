import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/broadcast', () => ({
  default: {
    getDriverName: vi.fn(),
    getDriverConfig: vi.fn(),
  },
}));

vi.mock('@broadcast/drivers/InMemory', () => ({ InMemoryDriver: { send: vi.fn() } }));
vi.mock('@broadcast/drivers/Pusher', () => ({ PusherDriver: { send: vi.fn() } }));
vi.mock('@broadcast/drivers/Redis', () => ({ RedisDriver: { send: vi.fn() } }));
vi.mock('@broadcast/drivers/RedisHttps', () => ({ RedisHttpsDriver: { send: vi.fn() } }));

import Broadcast from '@/tools/broadcast/Broadcast';
import { InMemoryDriver } from '@broadcast/drivers/InMemory';
import { PusherDriver } from '@broadcast/drivers/Pusher';
import { RedisDriver } from '@broadcast/drivers/Redis';
import { RedisHttpsDriver } from '@broadcast/drivers/RedisHttps';
import broadcastConfig from '@config/broadcast';

beforeEach(() => vi.clearAllMocks());

describe('Broadcast', () => {
  it('uses InMemory driver when configured', async () => {
    (broadcastConfig.getDriverName as any).mockReturnValue('inmemory');
    (InMemoryDriver.send as any).mockResolvedValue({ ok: true, provider: 'inmemory' });

    const res = await Broadcast.send('chan', 'evt', { a: 1 });
    expect(res).toEqual({ ok: true, provider: 'inmemory' });
    expect(InMemoryDriver.send).toHaveBeenCalled();
  });

  it('throws config error when pusher config mismatch', async () => {
    (broadcastConfig.getDriverName as any).mockReturnValue('pusher');
    (broadcastConfig.getDriverConfig as any).mockReturnValue({ driver: 'redis' });

    await expect(Broadcast.send('c', 'e', {})).rejects.toBeDefined();
  });

  it('calls Pusher driver when configured properly', async () => {
    (broadcastConfig.getDriverName as any).mockReturnValue('pusher');
    (broadcastConfig.getDriverConfig as any).mockReturnValue({ driver: 'pusher', appId: 'x' });
    (PusherDriver.send as any).mockResolvedValue({ ok: true, provider: 'pusher' });

    const res = await Broadcast.send('c', 'e', {});
    expect(PusherDriver.send).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, provider: 'pusher' });
  });

  it('throws on unknown driver', async () => {
    (broadcastConfig.getDriverName as any).mockReturnValue('unknown');
    await expect(Broadcast.send('c', 'e', {})).rejects.toBeDefined();
  });

  it('calls redishttps driver when configured properly', async () => {
    (broadcastConfig.getDriverName as any).mockReturnValue('redishttps');
    (broadcastConfig.getDriverConfig as any).mockReturnValue({ driver: 'redishttps' });
    (RedisHttpsDriver.send as any).mockResolvedValue({ ok: true, provider: 'redishttps' });

    const res = await Broadcast.send('c', 'e', {});
    expect(RedisHttpsDriver.send).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, provider: 'redishttps' });
  });

  it('calls redis driver when configured properly', async () => {
    (broadcastConfig.getDriverName as any).mockReturnValue('redis');
    (broadcastConfig.getDriverConfig as any).mockReturnValue({ driver: 'redis' });
    (RedisDriver.send as any).mockResolvedValue({ ok: true, provider: 'redis' });

    const res = await Broadcast.send('c', 'e', {});
    expect(RedisDriver.send).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, provider: 'redis' });
  });
});
