import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { HttpClient } from '@httpClient/Http';

export type RedisHttpsBroadcastDriverConfig = {
  driver: 'redishttps';
  endpoint: string;
  token: string;
  channelPrefix: string;
};

const normalizePrefix = (value: string): string => {
  const prefix = (value ?? '').trim();
  return prefix || 'broadcast:';
};

const validateConfig = (config: RedisHttpsBroadcastDriverConfig): void => {
  const endpoint = (config.endpoint ?? '').trim();
  const token = (config.token ?? '').trim();

  if (!endpoint) {
    throw ErrorFactory.createConfigError(
      'Redis HTTPS broadcast driver requires REDIS_HTTPS_ENDPOINT'
    );
  }

  if (!token) {
    throw ErrorFactory.createConfigError('Redis HTTPS broadcast driver requires REDIS_HTTPS_TOKEN');
  }
};

export const RedisHttpsDriver = Object.freeze({
  async send(
    config: RedisHttpsBroadcastDriverConfig,
    channel: string,
    event: string,
    data: unknown
  ) {
    validateConfig(config);

    let message: string;
    try {
      message = JSON.stringify({ event, data });
    } catch (err) {
      throw ErrorFactory.createTryCatchError('Failed to serialize broadcast payload', err as Error);
    }

    const fullChannel = `${normalizePrefix(config.channelPrefix)}${channel}`;
    const timeout = Env.getInt('REDIS_HTTPS_TIMEOUT', 5000);

    const response = await HttpClient.post(config.endpoint, {
      command: 'PUBLISH',
      channel: fullChannel,
      message,
    })
      .withAuth(config.token)
      .withTimeout(timeout)
      .send();

    response.throwIfServerError();
    response.throwIfClientError();

    const published = (() => {
      const trimmed = response.body.trim();
      const asNum = Number(trimmed);
      if (!Number.isFinite(asNum)) return undefined;
      return asNum;
    })();

    return { ok: true, published };
  },
});

export default RedisHttpsDriver;
