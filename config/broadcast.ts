// @ts-ignore - config templates are excluded from the main TS project in this repo
import type { BroadcastConfigOverrides } from '@config/broadcast';
import { Env } from '@config/env';

/**
 * Broadcast Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 */

export default {
  default: Env.get('BROADCAST_CONNECTION', Env.get('BROADCAST_DRIVER', 'inmemory')),
  // Example socket overrides for projects that want business-level control while
  // keeping the framework-owned socket transport routes in core.
  // socket: {
  //   authMiddleware: ['auth', 'jwt'],
  //   async authorize(_request, context) {
  //     if (context.channelName.startsWith('private-')) {
  //       return {
  //         authorized: context.user !== null && context.user !== undefined,
  //       };
  //     }
  //
  //     if (context.channelName.startsWith('public-')) {
  //       return {
  //         authorized: true,
  //       };
  //     }
  //
  //     return {
  //       authorized: false,
  //     };
  //   },
  //   async publish(_request, context) {
  //     if (context.event.startsWith('admin.')) {
  //       return {
  //         allowed: context.user !== null && context.user !== undefined,
  //         message: 'Admin publish requires an authenticated user.',
  //       };
  //     }
  //
  //     return {
  //       allowed: true,
  //     };
  //   },
  // },
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
