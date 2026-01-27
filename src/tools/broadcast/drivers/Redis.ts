import { ensureDriver } from '@config/redis';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { createRedisKey } from '@tools/redis/RedisKeyManager';

export type IRedisPublishClient = {
  connect?: () => Promise<void>;
  publish(channel: string, message: string): Promise<number>;
};

export type RedisBroadcastDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  password: string;
  channelPrefix: string;
};

const normalizePrefix = (value: string): string => {
  const prefix = (value ?? '').trim();
  return prefix || 'broadcast:';
};

export const RedisDriver = (() => {
  return {
    async send(config: RedisBroadcastDriverConfig, channel: string, event: string, data: unknown) {
      const cli = await ensureDriver<IRedisPublishClient>('publish');

      const prefixedChannel = createRedisKey(
        `broadcast:${normalizePrefix(config.channelPrefix)}${channel}`
      );

      let message: string;
      try {
        message = JSON.stringify({ event, data });
      } catch (err) {
        throw ErrorFactory.createTryCatchError(
          'Failed to serialize broadcast payload',
          err as Error
        );
      }

      const published = await cli.publish(prefixedChannel, message);

      return { ok: true, published };
    },
  } as const;
})();

export default RedisDriver;
