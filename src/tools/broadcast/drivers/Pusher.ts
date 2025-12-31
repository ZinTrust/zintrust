import type { PusherBroadcastDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHash, createHmac } from '@node-singletons/crypto';

type PusherEventPayload = {
  name: string;
  channels: string[];
  data: string;
};

const md5Hex = (data: string): string => createHash('md5').update(data).digest('hex');

const buildQueryString = (params: Record<string, string>): string => {
  const keys = Object.keys(params).sort((a, b) => a.localeCompare(b));
  return keys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] ?? '')}`)
    .join('&');
};

const buildBaseUrl = (cluster: string): string => {
  const normalized = cluster.trim();
  if (normalized === '') return 'https://api.pusherapp.com';
  return `https://api-${normalized}.pusher.com`;
};

const ensureConfig = (config: PusherBroadcastDriverConfig): void => {
  if (config.appId.trim() === '') {
    throw ErrorFactory.createConfigError(
      'Pusher broadcast misconfigured: PUSHER_APP_ID is required'
    );
  }
  if (config.key.trim() === '') {
    throw ErrorFactory.createConfigError(
      'Pusher broadcast misconfigured: PUSHER_APP_KEY is required'
    );
  }
  if (config.secret.trim() === '') {
    throw ErrorFactory.createConfigError(
      'Pusher broadcast misconfigured: PUSHER_APP_SECRET is required'
    );
  }
};

const signRequest = (params: {
  method: 'POST';
  path: string;
  secret: string;
  queryString: string;
}): string => {
  const stringToSign = `${params.method}\n${params.path}\n${params.queryString}`;
  return createHmac('sha256', params.secret).update(stringToSign).digest('hex');
};

export const PusherDriver = Object.freeze({
  async send(config: PusherBroadcastDriverConfig, channel: string, event: string, data: unknown) {
    ensureConfig(config);

    const payload: PusherEventPayload = {
      name: event,
      channels: [channel],
      data: JSON.stringify(data ?? null),
    };

    const body = JSON.stringify(payload);
    const path = `/apps/${config.appId}/events`;

    const authTimestamp = String(Math.floor(Date.now() / 1000));
    const queryParams: Record<string, string> = {
      auth_key: config.key,
      auth_timestamp: authTimestamp,
      auth_version: '1.0',
      body_md5: md5Hex(body),
    };

    const queryString = buildQueryString(queryParams);
    const authSignature = signRequest({ method: 'POST', path, secret: config.secret, queryString });

    const baseUrl = buildBaseUrl(config.cluster);
    const url = `${baseUrl}${path}?${queryString}&auth_signature=${authSignature}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      let responseBody: string | undefined;
      try {
        responseBody = await res.text();
      } catch {
        responseBody = undefined;
      }

      throw ErrorFactory.createTryCatchError(`Pusher broadcast request failed (${res.status})`, {
        status: res.status,
        body: responseBody,
      });
    }

    return { ok: true };
  },
});

export default PusherDriver;
