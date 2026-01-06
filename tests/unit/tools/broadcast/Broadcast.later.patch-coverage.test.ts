import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueMock = {
  enqueue: vi.fn(),
};

vi.mock('@tools/queue/Queue', () => ({
  Queue: queueMock,
  default: queueMock,
}));

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

vi.mock('@config/broadcast', () => ({
  default: {
    getDriverName: () => 'inmemory',
    getDriverConfig: () => ({ driver: 'inmemory' }),
  },
}));

describe('Broadcast (later + now patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    queueMock.enqueue.mockResolvedValue('msg-1');
  });

  it('broadcastNow delegates to send()', async () => {
    vi.doMock('@broadcast/BroadcastRegistry', () => ({
      BroadcastRegistry: {
        has: () => true,
        get: () => ({ driver: 'inmemory' }),
      },
    }));

    const { Broadcast } = await import('@broadcast/Broadcast');
    await expect(Broadcast.broadcastNow('c', 'e', { a: 1 })).resolves.toBe('ok');
  });

  it('BroadcastLater enqueues with type/attempts and provided timestamp', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');

    await expect(
      Broadcast.BroadcastLater('c', 'e', { a: 1 }, { queueName: 'q', timestamp: 123 })
    ).resolves.toBe('msg-1');

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({
        type: 'broadcast',
        channel: 'c',
        event: 'e',
        data: { a: 1 },
        timestamp: 123,
        attempts: 0,
      })
    );
  });

  it('queue(queueName).BroadcastLater forces queueName and uses Date.now default timestamp', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(999);
    const { Broadcast } = await import('@broadcast/Broadcast');

    await Broadcast.queue('broadcasts').BroadcastLater('c', 'e', { a: 1 });

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'broadcasts',
      expect.objectContaining({
        timestamp: 999,
        attempts: 0,
      })
    );

    nowSpy.mockRestore();
  });
});
