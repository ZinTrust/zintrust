/**
 * Broadcast Configuration
 *
 * Centralizes broadcast driver selection and provider env mappings.
 * Driver selection must be dynamic (tests may mutate process.env).
 */

import { Env } from '@zintrust/core';
import {
  BroadcastConfigInput,
  BroadcastDrivers,
  InMemoryBroadcastDriverConfig,
  KnownBroadcastDriverConfig,
  PusherBroadcastDriverConfig,
  RedisBroadcastDriverConfig,
  RedisHttpsBroadcastDriverConfig,
} from '@zintrust/core';
import { ErrorFactory } from '@zintrust/core';

const normalizeDriverName = (value: string): string => value.trim().toLowerCase();

const hasOwn = (obj: Record<string, unknown>, key: string): boolean => {
  return Object.hasOwn(obj, key);
};

const getDefaultBroadcaster = (drivers: BroadcastDrivers): string => {
  const envSelectedRaw = Env.get('BROADCAST_CONNECTION', Env.get('BROADCAST_DRIVER', 'inmemory'));
  const value = normalizeDriverName(envSelectedRaw ?? 'inmemory');

  if (value.length > 0 && hasOwn(drivers, value)) return value;

  if (envSelectedRaw.trim().length > 0) {
    throw ErrorFactory.createConfigError(`Broadcast driver not configured: ${value}`);
  }

  return hasOwn(drivers, 'inmemory') ? 'inmemory' : (Object.keys(drivers)[0] ?? 'inmemory');
};

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

const getBroadcastDriver = (
  config: BroadcastConfigInput,
  name?: string
): KnownBroadcastDriverConfig => {
  const selected = normalizeDriverName(String(name ?? config.default));
  const broadcasterName = selected === 'default' ? normalizeDriverName(config.default) : selected;

  const isExplicitSelection =
    name !== undefined &&
    String(name).trim().length > 0 &&
    normalizeDriverName(String(name)) !== 'default';

  if (broadcasterName.length > 0 && hasOwn(config.drivers, broadcasterName)) {
    const resolved = (config.drivers as Record<string, KnownBroadcastDriverConfig>)[
      broadcasterName
    ];
    if (resolved !== undefined) return resolved;
  }

  if (isExplicitSelection) {
    throw ErrorFactory.createConfigError(`Broadcast driver not configured: ${broadcasterName}`);
  }

  const fallback = config.drivers['inmemory'] ?? Object.values(config.drivers)[0];
  if (fallback !== undefined) return fallback;

  throw ErrorFactory.createConfigError('No broadcast drivers are configured');
};

const broadcastConfigObj = {
  /**
   * Default broadcaster name (normalized).
   */
  get default(): string {
    return getDefaultBroadcaster(this.drivers);
  },

  /**
   * Broadcast drivers.
   *
   * You may add custom named broadcasters (e.g. `ops`, `billing`) that point to any
   * known driver config.
   */
  drivers: {
    get inmemory(): InMemoryBroadcastDriverConfig {
      return { driver: 'inmemory' };
    },
    get pusher() {
      return getPusherConfig();
    },
    get redis() {
      return getRedisConfig();
    },
    get redishttps() {
      return getRedisHttpsConfig();
    },
  } satisfies BroadcastDrivers,

  /**
   * Normalized broadcast driver name for the default broadcaster.
   */
  getDriverName(): string {
    return normalizeDriverName(this.default);
  },

  /**
   * Get a config object for the currently selected driver.
   * Defaults to inmemory for unknown/unsupported names.
   */
  getDriverConfig(name?: string): KnownBroadcastDriverConfig {
    return getBroadcastDriver(this, name);
  },
} as const;

export default Object.freeze(broadcastConfigObj);
