import { Env } from '@config/env';
import type { IRouter } from '@core-routes/Router';
import type { IRequest } from '@http/Request';
import type { IncomingMessage } from '@node-singletons/http';
import type { Socket } from '@node-singletons/net';

export type SocketTransportMode = 'auto' | 'node' | 'cloudflare';

export type SocketFeatureSettings = Readonly<{
  enabled: boolean;
  transport: SocketTransportMode;
  path: string;
  appId: string;
  appKey: string;
  secret: string;
  activityTimeout: number;
}>;

export type SocketNodeUpgradeInput = Readonly<{
  request: IncomingMessage;
  socket: Socket;
  head: Buffer;
}>;

export type SocketWorkerContext = Readonly<{
  env?: unknown;
  ctx?: unknown;
}>;

export type SocketAuthorizationContext = Readonly<{
  channelName: string;
  socketId: string;
  user: unknown;
  channelData?: string;
}>;

export type SocketAuthorizationDecision = Readonly<{
  authorized: boolean;
  auth?: string;
  channelData?: string;
}>;

export type SocketAuthorizerHandler = (
  request: IRequest,
  context: SocketAuthorizationContext
) => Promise<SocketAuthorizationDecision> | SocketAuthorizationDecision;

export type SocketAuthorizer = Readonly<{
  authorize: SocketAuthorizerHandler;
}>;

export type SocketPublishContext = Readonly<{
  appId: string;
  channels: readonly string[];
  event: string;
  data: unknown;
  socketId?: string;
  user: unknown;
}>;

export type SocketPublishDecision = Readonly<{
  allowed: boolean;
  channels?: readonly string[];
  event?: string;
  data?: unknown;
  socketId?: string;
  statusCode?: number;
  message?: string;
}>;

export type SocketPublishPolicyHandler = (
  request: IRequest,
  context: SocketPublishContext
) => Promise<SocketPublishDecision> | SocketPublishDecision;

export type SocketPublishPolicy = Readonly<{
  authorize: SocketPublishPolicyHandler;
}>;

export type SocketRuntimeDiagnostics = Readonly<{
  enabled: boolean;
  transport: 'node' | 'cloudflare';
  path: string;
  appKeyConfigured: boolean;
}>;

export type SocketRouteRegistrar = Readonly<{
  registerRoutes: (router: IRouter) => void;
}>;

export type SocketRuntime = Readonly<{
  name: string;
  isEnabled: () => boolean;
  describe: () => SocketRuntimeDiagnostics;
  canHandleNodeUpgrade: (input: SocketNodeUpgradeInput) => boolean;
  handleNodeUpgrade: (input: SocketNodeUpgradeInput) => Promise<boolean>;
  canHandleWorkerRequest: (request: Request) => boolean;
  handleWorkerRequest: (request: Request, context: SocketWorkerContext) => Promise<Response | null>;
}>;

const normalizeSocketPath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return '/app';

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

const pickFirstNonEmpty = (...values: string[]): string => {
  for (const value of values) {
    if (value.trim() !== '') {
      return value.trim();
    }
  }

  return '';
};

const resolveTransport = (value: string): SocketTransportMode => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'node' || normalized === 'cloudflare') {
    return normalized;
  }

  return 'auto';
};

const readEnvString = (key: string, fallback = ''): string => {
  if (typeof Env.get === 'function') {
    return Env.get(key, fallback);
  }

  return fallback;
};

const readEnvBool = (key: string, fallback: boolean): boolean => {
  if (typeof Env.getBool === 'function') {
    return Env.getBool(key, fallback);
  }

  return fallback;
};

const readEnvInt = (key: string, fallback: number): number => {
  if (typeof Env.getInt === 'function') {
    return Env.getInt(key, fallback);
  }

  return fallback;
};

export const SocketFeature = Object.freeze({
  getSettings(): SocketFeatureSettings {
    return Object.freeze({
      enabled: readEnvBool('SOCKET_ENABLED', false),
      transport: resolveTransport(readEnvString('SOCKET_TRANSPORT', 'auto')),
      path: normalizeSocketPath(readEnvString('SOCKET_PATH', '/app')),
      appId: pickFirstNonEmpty(
        readEnvString('PUSHER_APP_ID', ''),
        readEnvString('BROADCAST_APP_ID', '')
      ),
      appKey: pickFirstNonEmpty(
        readEnvString('PUSHER_APP_KEY', ''),
        readEnvString('BROADCAST_AUTH_KEY', ''),
        readEnvString('BROADCAST_APP_KEY', '')
      ),
      secret: pickFirstNonEmpty(
        readEnvString('PUSHER_APP_SECRET', ''),
        readEnvString('BROADCAST_SECRET', ''),
        readEnvString('BROADCAST_APP_SECRET', '')
      ),
      activityTimeout: readEnvInt('BROADCAST_ACTIVITY_TIMEOUT', 120),
    });
  },
});

export default SocketFeature;
