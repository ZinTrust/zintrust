import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@broadcast/drivers/InMemory', () => ({
  InMemoryDriver: { send: vi.fn().mockResolvedValue('ok') },
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

describe('Broadcast (patch coverage extra)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('uses registry when broadcaster exists immediately', async () => {
    vi.doMock('@broadcast/BroadcastRegistry', () => ({
      BroadcastRegistry: {
        has: () => true,
        get: () => ({ driver: 'inmemory' }),
      },
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(Broadcast.broadcaster('inmemory').send('c', 'e', { a: 1 })).resolves.toBe('ok');
  });

  it('uses registry after runtime registration attempt', async () => {
    const hasMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);

    vi.doMock('@broadcast/BroadcastRegistry', () => ({
      BroadcastRegistry: {
        has: hasMock,
        get: () => ({ driver: 'inmemory' }),
      },
    }));

    vi.doMock('@broadcast/BroadcastRuntimeRegistration', () => ({
      registerBroadcastersFromRuntimeConfig: () => {},
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(Broadcast.broadcaster('inmemory').send('c', 'e', { a: 1 })).resolves.toBe('ok');
  });
});
