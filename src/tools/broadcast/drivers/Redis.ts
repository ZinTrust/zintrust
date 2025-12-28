import { ErrorFactory } from '@exceptions/ZintrustError';

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

const buildRedisUrl = (config: RedisBroadcastDriverConfig): string => {
  const host = (config.host ?? '').trim();
  const port = Number(config.port);

  if (!host) throw ErrorFactory.createConfigError('Redis broadcast driver requires host');
  if (!Number.isFinite(port) || port <= 0) {
    throw ErrorFactory.createConfigError('Redis broadcast driver requires a valid port');
  }

  const password = (config.password ?? '').trim();
  const authPart = password ? `:${encodeURIComponent(password)}@` : '';

  return `redis://${authPart}${host}:${port}`;
};

export const RedisDriver = (() => {
  let client: IRedisPublishClient | null = null;
  let connected = false;

  const ensureClient = async (config: RedisBroadcastDriverConfig): Promise<IRedisPublishClient> => {
    // Always validate config even if a client is already cached
    const url = buildRedisUrl(config);
    if (connected && client !== null) return client;

    // Import lazily so package is optional for environments that don't use Redis
    try {
      const mod = (await import('redis')) as unknown as {
        createClient: (opts: { url: string }) => IRedisPublishClient;
      };
      client = mod.createClient({ url });

      if (typeof client.connect === 'function') {
        try {
          await client.connect();
          connected = true;
        } catch (err) {
          connected = false;
          throw ErrorFactory.createTryCatchError(
            'Redis broadcast driver failed to connect',
            err as Error
          );
        }
      } else {
        connected = true;
      }
    } catch {
      const globalFake = (globalThis as unknown as { __fakeRedisClient?: IRedisPublishClient })
        .__fakeRedisClient;
      if (globalFake === undefined) {
        throw ErrorFactory.createConfigError(
          "Redis broadcast driver requires the 'redis' package or a test fake client set in globalThis.__fakeRedisClient"
        );
      }

      client = globalFake;
      connected = true;
    }

    if (client === null)
      throw ErrorFactory.createConfigError('Redis client could not be initialized');
    return client;
  };

  const normalizePrefix = (value: string): string => {
    const prefix = (value ?? '').trim();
    return prefix || 'broadcast:';
  };

  return {
    async send(config: RedisBroadcastDriverConfig, channel: string, event: string, data: unknown) {
      const cli = await ensureClient(config);

      const fullChannel = `${normalizePrefix(config.channelPrefix)}${channel}`;

      let message: string;
      try {
        message = JSON.stringify({ event, data });
      } catch (err) {
        throw ErrorFactory.createTryCatchError(
          'Failed to serialize broadcast payload',
          err as Error
        );
      }

      const published = await cli.publish(fullChannel, message);
      return { ok: true, published };
    },
  } as const;
})();

export default RedisDriver;
