/**
 * Broadcast Configuration
 *
 * Centralizes broadcast driver selection and provider env mappings.
 * Driver selection must be dynamic (tests may mutate process.env).
 */

import { Env } from '@zintrust/core';

export type KnownBroadcastDriverName = 'inmemory' | 'pusher' | 'redis' | 'redishttps';

export type InMemoryBroadcastDriverConfig = {
  driver: 'inmemory';
};

export type PusherBroadcastDriverConfig = {
  driver: 'pusher';
  appId: string;
  key: string;
  secret: string;
  cluster: string;
  useTLS: boolean;
};

export type RedisBroadcastDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  password: string;
  channelPrefix: string;
};

export type RedisHttpsBroadcastDriverConfig = {
  driver: 'redishttps';
  endpoint: string;
  token: string;
  channelPrefix: string;
};

export type KnownBroadcastDriverConfig =
  | InMemoryBroadcastDriverConfig
  | PusherBroadcastDriverConfig
  | RedisBroadcastDriverConfig
  | RedisHttpsBroadcastDriverConfig;

const normalizeDriverName = (value: string): string => value.trim().toLowerCase();

const getPusherConfig = (): PusherBroadcastDriverConfig => ({
  driver: 'pusher',
  appId: Env.get('PUSHER_APP_ID', ''),
  key: Env.get('PUSHER_APP_KEY', ''),
  secret: Env.get('PUSHER_APP_SECRET', ''),
  cluster: Env.get('PUSHER_APP_CLUSTER', ''),
  useTLS: Env.getBool('PUSHER_USE_TLS', true),
});

const getRedisConfig = (): RedisBroadcastDriverConfig => ({
  driver: 'redis',
  host: Env.get('BROADCAST_REDIS_HOST', Env.get('REDIS_HOST', 'localhost')),
  port: Env.getInt('BROADCAST_REDIS_PORT', Env.getInt('REDIS_PORT', 6379)),
  password: Env.get('BROADCAST_REDIS_PASSWORD', Env.get('REDIS_PASSWORD', '')),
  channelPrefix: Env.get('BROADCAST_CHANNEL_PREFIX', 'broadcast:'),
});

const getRedisHttpsConfig = (): RedisHttpsBroadcastDriverConfig => ({
  driver: 'redishttps',
  endpoint: Env.get('REDIS_HTTPS_ENDPOINT', ''),
  token: Env.get('REDIS_HTTPS_TOKEN', ''),
  channelPrefix: Env.get('BROADCAST_CHANNEL_PREFIX', 'broadcast:'),
});

const broadcastConfigObj = {
  /**
   * Normalized broadcast driver name.
   *
   * NOTE: Allows custom driver names (project-specific drivers), so returns string.
   */
  getDriverName(): string {
    return normalizeDriverName(Env.get('BROADCAST_DRIVER', 'inmemory'));
  },

  /**
   * Get a config object for the currently selected driver.
   * Defaults to inmemory for unknown/unsupported names.
   */
  getDriverConfig(): KnownBroadcastDriverConfig {
    const driver = this.getDriverName();

    if (driver === 'pusher') return getPusherConfig();
    if (driver === 'redis') return getRedisConfig();
    if (driver === 'redishttps') return getRedisHttpsConfig();

    return { driver: 'inmemory' };
  },
} as const;

export default Object.freeze(broadcastConfigObj);
