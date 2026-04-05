import { isArray, isNonEmptyString } from '@/helper';
import { InMemoryDriver } from '@broadcast/drivers/InMemory';
import { PusherDriver } from '@broadcast/drivers/Pusher';
import { RedisDriver } from '@broadcast/drivers/Redis';
import { RedisHttpsDriver } from '@broadcast/drivers/RedisHttps';
import broadcastConfig from '@config/broadcast';
import type { KnownBroadcastDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';

type Broadcaster = Readonly<{
  send: (channel: string, event: string, data: unknown) => Promise<unknown>;
  publish: (input: BroadcastPublishInput) => Promise<BroadcastPublishResult>;
}>;

type BroadcastDeliveryMode = 'auto' | 'socket' | 'driver';

export type BroadcastPublishInput = Readonly<{
  channel?: string;
  channels?: readonly string[];
  event?: string;
  name?: string;
  data?: unknown;
  socketId?: string;
  delivery?: BroadcastDeliveryMode;
  broadcaster?: string;
  request?: IRequest;
  user?: unknown;
}>;

type NormalizedBroadcastPublishInput = Readonly<{
  channels: readonly string[];
  event: string;
  data: unknown;
  socketId?: string;
  delivery: BroadcastDeliveryMode;
  broadcaster?: string;
  request?: IRequest;
  user?: unknown;
}>;

export type BroadcastPublishResult = Readonly<{
  ok: true;
  transport: 'socket' | 'driver';
  channels: readonly string[];
  event: string;
  deliveries?: number;
  driver?: KnownBroadcastDriverConfig['driver'];
  broadcaster?: string;
  result?: unknown;
  results?: readonly unknown[];
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

const normalizeDelivery = (value: unknown): BroadcastDeliveryMode => {
  if (value === 'socket' || value === 'driver') {
    return value;
  }

  return 'auto';
};

const normalizePublishInput = (input: BroadcastPublishInput): NormalizedBroadcastPublishInput => {
  let event = '';
  if (isNonEmptyString(input.event)) {
    event = input.event.trim();
  } else if (isNonEmptyString(input.name)) {
    event = input.name.trim();
  }

  const channels = (() => {
    if (isArray(input.channels)) {
      return input.channels.filter(isNonEmptyString).map((channel) => channel.trim());
    }

    if (isNonEmptyString(input.channel)) {
      return [input.channel.trim()];
    }

    return [];
  })();

  if (event === '' || channels.length === 0) {
    throw ErrorFactory.createValidationError(
      'Broadcast.publish requires event/name and channel/channels.'
    );
  }

  return {
    channels,
    event,
    data: input.data ?? {},
    ...(isNonEmptyString(input.socketId) ? { socketId: input.socketId.trim() } : {}),
    delivery: normalizeDelivery(input.delivery),
    ...(isNonEmptyString(input.broadcaster) ? { broadcaster: input.broadcaster.trim() } : {}),
    ...(input.request === undefined ? {} : { request: input.request }),
    ...(input.user === undefined ? {} : { user: input.user }),
  };
};

const tryPublishViaSocket = async (
  input: NormalizedBroadcastPublishInput
): Promise<BroadcastPublishResult | null> => {
  try {
    const socketModule = await import('@zintrust/socket');
    if (socketModule.socketRuntime.isEnabled() !== true) {
      return null;
    }

    const socketResult = await socketModule.publishSocketEventFromServer({
      channels: input.channels,
      event: input.event,
      data: input.data,
      socketId: input.socketId,
      request: input.request,
      user: input.user,
    });

    return {
      ok: true,
      transport: 'socket',
      channels: socketResult.channels,
      event: socketResult.event,
      deliveries: socketResult.deliveries,
      result: socketResult,
    };
  } catch (error) {
    if (input.delivery === 'socket') {
      throw error;
    }

    return null;
  }
};

const publishWithConfig = async (
  config: KnownBroadcastDriverConfig,
  broadcasterName: string | undefined,
  input: NormalizedBroadcastPublishInput
): Promise<BroadcastPublishResult> => {
  const results = await Promise.all(
    input.channels.map(async (channel) => sendWithConfig(config, channel, input.event, input.data))
  );

  return {
    ok: true,
    transport: 'driver',
    channels: input.channels,
    event: input.event,
    driver: config.driver,
    ...(broadcasterName === undefined ? {} : { broadcaster: broadcasterName }),
    ...(results.length === 1 ? { result: results[0] } : { results }),
  };
};

const publishInternal = async (input: BroadcastPublishInput): Promise<BroadcastPublishResult> => {
  const normalized = normalizePublishInput(input);

  if (normalized.delivery !== 'driver') {
    const socketResult = await tryPublishViaSocket(normalized);
    if (socketResult !== null) {
      return socketResult;
    }
  }

  if (normalized.delivery === 'socket') {
    throw ErrorFactory.createConfigError('Socket publish delivery is not available.');
  }

  const config = await resolveBroadcasterConfig(normalized.broadcaster);
  return publishWithConfig(config, normalized.broadcaster, normalized);
};

const publishLaterInternal = async (
  input: BroadcastPublishInput,
  options: { queueName?: string; timestamp?: number } = {}
): Promise<string> => {
  const normalized = normalizePublishInput(input);
  const { queueName = 'broadcasts', timestamp = Date.now() } = options;
  const { Queue } = await import('@tools/queue/Queue');

  return Queue.enqueue(queueName, {
    type: 'broadcast',
    channel: normalized.channels[0],
    channels: normalized.channels,
    event: normalized.event,
    data: normalized.data,
    ...(normalized.socketId === undefined ? {} : { socketId: normalized.socketId }),
    ...(normalized.broadcaster === undefined ? {} : { broadcaster: normalized.broadcaster }),
    delivery: normalized.delivery,
    timestamp,
    attempts: 0,
  });
};

export const Broadcast = Object.freeze({
  async publish(input: BroadcastPublishInput): Promise<BroadcastPublishResult> {
    return publishInternal(input);
  },

  async send(channel: string, event: string, data: unknown) {
    const result = await publishInternal({ channel, event, data });
    if (result.transport === 'driver') {
      return result.result ?? result.results ?? result;
    }

    return result.result ?? result;
  },

  // Alias for send() - explicit intent for immediate broadcast
  async broadcastNow(channel: string, event: string, data: unknown) {
    return this.send(channel, event, data);
  },

  async publishLater(
    input: BroadcastPublishInput,
    options: { queueName?: string; timestamp?: number } = {}
  ) {
    return publishLaterInternal(input, options);
  },

  // Queue broadcast for async processing
  async BroadcastLater(
    channel: string,
    event: string,
    data: unknown,
    options: { queueName?: string; timestamp?: number } = {}
  ) {
    return publishLaterInternal({ channel, event, data }, options);
  },

  queue(queueName: string) {
    return Object.freeze({
      publishLater: async (input: BroadcastPublishInput, options = {}) =>
        publishLaterInternal(input, { ...options, queueName }),
      BroadcastLater: async (channel: string, event: string, data: unknown, options = {}) =>
        publishLaterInternal({ channel, event, data }, { ...options, queueName }),
    });
  },

  broadcaster(name?: string): Broadcaster {
    return Object.freeze({
      send: async (channel: string, event: string, data: unknown): Promise<unknown> => {
        const result = await publishWithConfig(
          await resolveBroadcasterConfig(name),
          name,
          normalizePublishInput({ channel, event, data, delivery: 'driver', broadcaster: name })
        );
        return result.result ?? result.results ?? result;
      },
      publish: async (input: BroadcastPublishInput): Promise<BroadcastPublishResult> => {
        return publishWithConfig(
          await resolveBroadcasterConfig(name),
          name,
          normalizePublishInput({ ...input, delivery: 'driver', broadcaster: name })
        );
      },
    });
  },
});

export default Broadcast;
