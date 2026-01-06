import { InMemoryDriver } from '@broadcast/drivers/InMemory';
import { PusherDriver } from '@broadcast/drivers/Pusher';
import { RedisDriver } from '@broadcast/drivers/Redis';
import { RedisHttpsDriver } from '@broadcast/drivers/RedisHttps';
import broadcastConfig from '@config/broadcast';
import type { KnownBroadcastDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';

type Broadcaster = Readonly<{
  send: (channel: string, event: string, data: unknown) => Promise<unknown>;
}>;

const resolveBroadcasterConfig = async (name?: string): Promise<KnownBroadcastDriverConfig> => {
  const selection = (name ?? broadcastConfig.getDriverName()).toString().trim().toLowerCase();

  try {
    const { BroadcastRegistry } = await import('@broadcast/BroadcastRegistry');
    if (BroadcastRegistry.has(selection)) {
      return BroadcastRegistry.get(selection);
    }

    try {
      const { registerBroadcastersFromRuntimeConfig } =
        await import('@broadcast/BroadcastRuntimeRegistration');
      registerBroadcastersFromRuntimeConfig(broadcastConfig);
    } catch {
      // best-effort
    }

    if (BroadcastRegistry.has(selection)) {
      return BroadcastRegistry.get(selection);
    }
  } catch {
    // best-effort
  }

  // Fallback to config lookup (throws on explicit unknown).
  return broadcastConfig.getDriverConfig(name);
};

const sendWithConfig = async (
  config: KnownBroadcastDriverConfig,
  channel: string,
  event: string,
  data: unknown
): Promise<unknown> => {
  const driverName = config.driver;

  if (driverName === 'inmemory') {
    return InMemoryDriver.send(undefined as unknown, channel, event, data);
  }

  if (driverName === 'pusher') {
    return PusherDriver.send(config, channel, event, data);
  }

  if (driverName === 'redis') {
    return RedisDriver.send(config, channel, event, data);
  }

  if (driverName === 'redishttps') {
    return RedisHttpsDriver.send(config, channel, event, data);
  }

  throw ErrorFactory.createConfigError(`Broadcast driver not implemented: ${driverName}`);
};

export const Broadcast = Object.freeze({
  async send(channel: string, event: string, data: unknown) {
    const config = await resolveBroadcasterConfig();
    return sendWithConfig(config, channel, event, data);
  },

  // Alias for send() - explicit intent for immediate broadcast
  async broadcastNow(channel: string, event: string, data: unknown) {
    return this.send(channel, event, data);
  },

  // Queue broadcast for async processing
  async BroadcastLater(
    channel: string,
    event: string,
    data: unknown,
    options: { queueName?: string; timestamp?: number } = {}
  ) {
    const { queueName = 'broadcasts', timestamp = Date.now() } = options;
    const { Queue } = await import('@tools/queue/Queue');
    const messageId = await Queue.enqueue(queueName, {
      type: 'broadcast',
      channel,
      event,
      data,
      timestamp,
      attempts: 0,
    });
    return messageId;
  },

  queue(queueName: string) {
    return Object.freeze({
      BroadcastLater: async (channel: string, event: string, data: unknown, options = {}) =>
        Broadcast.BroadcastLater(channel, event, data, { ...options, queueName }),
    });
  },

  broadcaster(name?: string): Broadcaster {
    return Object.freeze({
      send: async (channel: string, event: string, data: unknown): Promise<unknown> => {
        const config = await resolveBroadcasterConfig(name);
        return sendWithConfig(config, channel, event, data);
      },
    });
  },
});

export default Broadcast;
