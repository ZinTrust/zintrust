import { Env, type BroadcastConfigOverrides } from '@zintrust/core';

/**
 * Broadcast Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 */

export default {
  default: Env.get('BROADCAST_CONNECTION', Env.get('BROADCAST_DRIVER', 'inmemory')),
  drivers: {
    inmemory: {
      driver: 'inmemory' as const,
    },
    pusher: {
      driver: 'pusher' as const,
      appId: Env.get('PUSHER_APP_ID', ''),
      key: Env.get('PUSHER_APP_KEY', ''),
      secret: Env.get('PUSHER_APP_SECRET', ''),
      cluster: Env.get('PUSHER_APP_CLUSTER', ''),
      useTLS: Env.getBool('PUSHER_USE_TLS', true),
    },
    redis: {
      driver: 'redis' as const,
      host: Env.get('BROADCAST_REDIS_HOST', Env.get('REDIS_HOST', 'localhost')),
      port: Env.getInt('BROADCAST_REDIS_PORT', Env.getInt('REDIS_PORT', 6379)),
      password: Env.get('BROADCAST_REDIS_PASSWORD', Env.get('REDIS_PASSWORD', '')),
      channelPrefix: Env.get('BROADCAST_CHANNEL_PREFIX', 'broadcast:'),
    },
    redishttps: {
      driver: 'redishttps' as const,
      endpoint: Env.get('REDIS_HTTPS_ENDPOINT', ''),
      token: Env.get('REDIS_HTTPS_TOKEN', ''),
      channelPrefix: Env.get('BROADCAST_CHANNEL_PREFIX', 'broadcast:'),
    },
  },
} satisfies BroadcastConfigOverrides;
