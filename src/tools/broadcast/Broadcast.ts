import { isArray, isNonEmptyString, isObject } from '@/helper';
import { InMemoryDriver } from '@broadcast/drivers/InMemory';
import { PusherDriver } from '@broadcast/drivers/Pusher';
import { RedisDriver } from '@broadcast/drivers/Redis';
import { RedisHttpsDriver } from '@broadcast/drivers/RedisHttps';
import broadcastConfig from '@config/broadcast';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { KnownBroadcastDriverConfig } from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';

type Broadcaster = Readonly<{
  send: (channel: string, event: string, data: unknown) => Promise<unknown>;
  publish: (input: BroadcastPublishInput) => Promise<BroadcastPublishResult>;
}>;

type BroadcastChannelScope = 'public' | 'private' | 'presence' | 'persistent';
type BroadcastDeliveryMode = 'auto' | 'socket' | 'driver';
type BroadcastTransport = 'internal-http' | 'socket' | 'driver';

const BROADCAST_CHANNEL_SCOPES = new Set<BroadcastChannelScope>([
  'public',
  'private',
  'presence',
  'persistent',
]);

export type BroadcastPublishInput = Readonly<{
  channel?: string;
  channels?: readonly string[];
  scope?: BroadcastChannelScope;
  channelScope?: BroadcastChannelScope;
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

type QueuedBroadcastPayload = Readonly<{
  type: 'broadcast';
  channel?: string;
  channels: readonly string[];
  event: string;
  data: unknown;
  socketId?: string;
  broadcaster?: string;
  delivery: BroadcastDeliveryMode;
  timestamp: number;
  attempts: number;
}>;

export type BroadcastPublishResult = Readonly<{
  ok: true;
  transport: BroadcastTransport;
  channels: readonly string[];
  event: string;
  deliveries?: number;
  driver?: KnownBroadcastDriverConfig['driver'];
  broadcaster?: string;
  endpoint?: string;
  attemptedTransports?: readonly BroadcastTransport[];
  result?: unknown;
  results?: readonly unknown[];
}>;

type BroadcastTransportAttemptResult = Readonly<{
  result: BroadcastPublishResult | null;
  error?: unknown;
}>;

type HttpBridgeRuntimeConfig = Readonly<{
  url: string;
  secret: string;
}>;

type SocketPublishModule = Readonly<{
  publishSocketEventFromServer: (input: {
    channels: readonly string[];
    event: string;
    data: unknown;
    socketId?: string;
    request?: IRequest;
    user?: unknown;
  }) => Promise<{
    ok: true;
    transport: 'node' | 'cloudflare';
    channels: readonly string[];
    event: string;
    deliveries: number;
  }>;
}>;

const INTERNAL_SOCKET_SECRET_HEADER = 'x-zintrust-socket-secret';
const DEFAULT_BROADCAST_EVENTS_PATH_TEMPLATE = '/apps/{appId}/events';

const pickFirstNonEmpty = (...values: readonly string[]): string => {
  for (const value of values) {
    if (value.trim() !== '') {
      return value.trim();
    }
  }

  return '';
};

const normalizeChannelScope = (value: unknown): BroadcastChannelScope | undefined => {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (BROADCAST_CHANNEL_SCOPES.has(normalized as BroadcastChannelScope)) {
    return normalized as BroadcastChannelScope;
  }

  return undefined;
};

const getQualifiedChannelScope = (channel: string): BroadcastChannelScope | undefined => {
  if (channel.startsWith('private-')) return 'private';
  if (channel.startsWith('presence-')) return 'presence';
  if (channel.startsWith('persistent-')) return 'persistent';
  return undefined;
};

const applyChannelScope = (channel: string, scope: BroadcastChannelScope | undefined): string => {
  const normalizedChannel = channel.trim();
  const existingScope = getQualifiedChannelScope(normalizedChannel);

  if (existingScope !== undefined) {
    if (scope !== undefined && scope !== existingScope) {
      throw ErrorFactory.createValidationError(
        `Broadcast channel scope ${scope} conflicts with fully-qualified channel ${normalizedChannel}.`
      );
    }

    return normalizedChannel;
  }

  if (scope === undefined || scope === 'public') {
    return normalizedChannel;
  }

  return `${scope}-${normalizedChannel}`;
};

const normalizeChannels = (input: BroadcastPublishInput): readonly string[] => {
  const scope = normalizeChannelScope(input.channelScope ?? input.scope);

  if (isArray(input.channels)) {
    return input.channels
      .filter(isNonEmptyString)
      .map((channel) => applyChannelScope(channel, scope));
  }

  if (isNonEmptyString(input.channel)) {
    return [applyChannelScope(input.channel, scope)];
  }

  return [];
};

const appendUnique = (values: string[], nextValue: string): void => {
  if (nextValue !== '' && !values.includes(nextValue)) {
    values.push(nextValue);
  }
};

const toAbsoluteBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('/')) {
    return '';
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`http://${trimmed}`).toString();
    } catch {
      return '';
    }
  }
};

const getLoopbackAlternativeBaseUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
      return parsed.toString();
    }

    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1'
    ) {
      parsed.hostname = '127.0.0.1';
      return parsed.toString();
    }
  } catch {
    return '';
  }

  return '';
};

const resolveBroadcastAppId = (): string => {
  return (
    pickFirstNonEmpty(Env.get('PUSHER_APP_ID', ''), Env.get('BROADCAST_APP_ID', '')) || 'internal'
  );
};

const resolveBroadcastSecret = (): string => {
  return pickFirstNonEmpty(
    Env.get('BROADCAST_BRIDGE_SECRET', ''),
    Env.get('X_ZINTRUST_SOCKET_SEC', ''),
    Env.get('BROADCAST_SECRET', ''),
    Env.get('PUSHER_APP_SECRET', ''),
    Env.get('BROADCAST_APP_SECRET', '')
  );
};

const resolveBridgePath = (appId: string, value?: string): string => {
  const raw = (value ?? DEFAULT_BROADCAST_EVENTS_PATH_TEMPLATE).trim();
  const withLeadingSlash = raw === '' ? DEFAULT_BROADCAST_EVENTS_PATH_TEMPLATE : raw;
  const normalized = withLeadingSlash.startsWith('/') ? withLeadingSlash : `/${withLeadingSlash}`;

  return normalized
    .replaceAll('{appId}', encodeURIComponent(appId))
    .replaceAll(':appId', encodeURIComponent(appId));
};

const resolveExplicitEndpoint = (value: string, appId: string): string => {
  const absoluteUrl = toAbsoluteBaseUrl(value);
  if (absoluteUrl === '') {
    return '';
  }

  try {
    const parsed = new URL(absoluteUrl);
    if (parsed.pathname === '/' || parsed.pathname.trim() === '') {
      parsed.pathname = resolveBridgePath(appId);
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

const resolveLegacyBridgeEndpoint = (appId: string): string => {
  const host = Env.get('ZINTRUST_SOCKET_HOST', '').trim();
  if (host === '') {
    return '';
  }

  const port = Env.get('ZINTRUST_SOCKET_PORT', '').trim();
  const protocol = pickFirstNonEmpty(Env.get('BROADCAST_BRIDGE_PROTOCOL', ''), 'http');
  const portSuffix = port === '' ? '' : `:${port}`;
  const baseUrl = `${protocol}://${host}${portSuffix}`;

  try {
    return new URL(
      resolveBridgePath(appId, Env.get('BROADCAST_BRIDGE_PATH', '')),
      baseUrl
    ).toString();
  } catch {
    return '';
  }
};

const buildEndpointCandidates = (values: readonly string[]): readonly string[] => {
  const resolved: string[] = [];
  for (const value of values) {
    appendUnique(resolved, value);
    appendUnique(resolved, getLoopbackAlternativeBaseUrl(value));
  }
  return resolved;
};

const getInternalPublishConfig = (): Readonly<{
  endpoints: readonly string[];
  appId: string;
  secret: string;
}> => {
  const baseUrls: string[] = [];
  appendUnique(baseUrls, toAbsoluteBaseUrl(Env.get('BROADCAST_INTERNAL_URL', '')));
  appendUnique(baseUrls, toAbsoluteBaseUrl(Env.get('APP_URL', '')));
  appendUnique(baseUrls, toAbsoluteBaseUrl(Env.get('BASE_URL', Env.BASE_URL ?? '')));

  const appId = resolveBroadcastAppId();
  const secret = resolveBroadcastSecret();

  return Object.freeze({
    endpoints: buildEndpointCandidates(baseUrls).map((baseUrl) =>
      new URL(`/apps/${encodeURIComponent(appId)}/events`, baseUrl).toString()
    ),
    appId,
    secret,
  });
};

const getBridgePublishConfig = (): Readonly<{
  endpoints: readonly string[];
  secret: string;
}> => {
  const appId = resolveBroadcastAppId();
  return Object.freeze({
    endpoints: buildEndpointCandidates([
      resolveExplicitEndpoint(Env.get('BROADCAST_BRIDGE_URL', ''), appId),
      resolveLegacyBridgeEndpoint(appId),
    ]),
    secret: resolveBroadcastSecret(),
  });
};

const isIsolatedWorkerRuntime = (): boolean => {
  return Env.getBool('WORKER_ISOLATED', false) || Env.getBool('DOCKER_WORKER', false);
};

const parseJsonResponseSafe = async (response: Response): Promise<unknown> => {
  const raw = await response.text();
  if (raw.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};

const getDeliveries = (payload: unknown): number | undefined => {
  if (!isObject(payload)) {
    return undefined;
  }

  const deliveries = payload['deliveries'];
  return typeof deliveries === 'number' && Number.isFinite(deliveries) ? deliveries : undefined;
};

const describeError = (error: unknown): unknown => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return String(error);
};

const logTransportFallback = (
  transport: BroadcastTransport,
  details: Record<string, unknown>
): void => {
  Logger.warn('Broadcast publish transport failed; falling back.', {
    transport,
    ...details,
  });
};

const requestInternalPublishEndpoint = async (
  endpoint: string,
  secret: string,
  payload: {
    channels: readonly string[];
    event: string;
    data: unknown;
    socket_id?: string;
  }
): Promise<BroadcastTransportAttemptResult> => {
  try {
    const response = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret === ''
          ? {}
          : {
              [INTERNAL_SOCKET_SECRET_HEADER]: secret,
              authorization: `Bearer ${secret}`,
            }),
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await parseJsonResponseSafe(response);
    if (!response.ok) {
      const error = ErrorFactory.createTryCatchError(
        `Internal socket publish request failed (${response.status})`,
        {
          status: response.status,
          endpoint,
          body: responseBody,
        }
      );
      logTransportFallback('internal-http', {
        endpoint,
        status: response.status,
        body: responseBody,
      });

      return { result: null, error };
    }

    const resolvedChannels =
      isObject(responseBody) && isArray(responseBody['channels'])
        ? responseBody['channels'].filter(isNonEmptyString).map((channel) => channel.trim())
        : payload.channels;
    const resolvedEvent =
      isObject(responseBody) && isNonEmptyString(responseBody['event'])
        ? responseBody['event'].trim()
        : payload.event;

    return {
      result: {
        ok: true,
        transport: 'internal-http',
        channels: resolvedChannels,
        event: resolvedEvent,
        deliveries: getDeliveries(responseBody),
        endpoint,
        result: responseBody,
      },
    };
  } catch (error) {
    logTransportFallback('internal-http', {
      endpoint,
      error: describeError(error),
    });

    return { result: null, error };
  }
};

const tryInternalPublishEndpoints = async (
  endpoints: readonly string[],
  secret: string,
  payload: {
    channels: readonly string[];
    event: string;
    data: unknown;
    socket_id?: string;
  },
  index = 0,
  lastError?: unknown
): Promise<BroadcastTransportAttemptResult> => {
  const endpoint = endpoints[index];
  if (endpoint === undefined) {
    return { result: null, error: lastError };
  }

  const attempt = await requestInternalPublishEndpoint(endpoint, secret, payload);
  if (attempt.result !== null) {
    return attempt;
  }

  return tryInternalPublishEndpoints(
    endpoints,
    secret,
    payload,
    index + 1,
    attempt.error ?? lastError
  );
};

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

  if (driverName === 'http-bridge') {
    return publishViaHttpBridgeDriver(
      toHttpBridgeRuntimeConfig(config),
      normalizePublishInput({ channel, event, data })
    );
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

  const channels = normalizeChannels(input);

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

/**
 * Error codes from publishSocketEventFromServer that represent policy/auth failures.
 * These must not be swallowed in auto delivery mode — the socket publish policy must
 * be respected even when a driver fallback is available.
 */
const NON_TRANSIENT_SOCKET_ERROR_CODES = new Set([
  'FORBIDDEN',
  'UNAUTHORIZED',
  'VALIDATION_ERROR',
  'SECURITY_ERROR',
  'SANITIZER_ERROR',
]);

/**
 * Returns true for authorization/validation/policy errors from the socket module.
 * Returns false for "socket unavailable" errors (module missing, disabled, connection
 * failure, config) which are safe to fall back from.
 */
const isNonTransientSocketError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && NON_TRANSIENT_SOCKET_ERROR_CODES.has(code);
};

const tryPublishViaSocket = async (
  input: NormalizedBroadcastPublishInput
): Promise<BroadcastTransportAttemptResult> => {
  try {
    const socketModule = (await import('@zintrust/socket')) as SocketPublishModule;
    const socketResult = await socketModule.publishSocketEventFromServer({
      channels: input.channels,
      event: input.event,
      data: input.data,
      socketId: input.socketId,
      request: input.request,
      user: input.user,
    });

    return {
      result: {
        ok: true,
        transport: 'socket',
        channels: socketResult.channels,
        event: socketResult.event,
        deliveries: socketResult.deliveries,
        result: socketResult,
      },
    };
  } catch (error) {
    // For authorization/validation/policy errors, rethrow even in auto delivery mode
    // to prevent bypassing socket publish policy via driver fallback.
    // Only allow fallback for "socket unavailable" cases (module missing, disabled, connection issues).
    if (isNonTransientSocketError(error)) {
      throw error;
    }
    return { result: null, error };
  }
};

const tryPublishViaInternalHttp = async (
  input: NormalizedBroadcastPublishInput
): Promise<BroadcastTransportAttemptResult> => {
  const config = getInternalPublishConfig();
  if (config.endpoints.length === 0 || typeof globalThis.fetch !== 'function') {
    return { result: null };
  }

  const payload = {
    channels: input.channels,
    event: input.event,
    data: input.data,
    ...(input.socketId === undefined ? {} : { socket_id: input.socketId }),
  };

  return tryInternalPublishEndpoints(config.endpoints, config.secret, payload);
};

const tryPublishViaConfiguredBridge = async (
  input: NormalizedBroadcastPublishInput,
  config: Readonly<{
    endpoints: readonly string[];
    secret: string;
  }>
): Promise<BroadcastTransportAttemptResult> => {
  if (config.endpoints.length === 0 || typeof globalThis.fetch !== 'function') {
    return { result: null };
  }

  const payload = {
    channels: input.channels,
    event: input.event,
    data: input.data,
    ...(input.socketId === undefined ? {} : { socket_id: input.socketId }),
  };

  return tryInternalPublishEndpoints(config.endpoints, config.secret, payload);
};

const shouldUseAutomaticHttpBridge = (
  config: KnownBroadcastDriverConfig,
  input: NormalizedBroadcastPublishInput
): boolean => {
  if (input.delivery === 'driver') {
    return false;
  }

  return config.driver === 'inmemory' && isIsolatedWorkerRuntime();
};

const toHttpBridgeRuntimeConfig = (config: {
  url: string;
  secret: string;
}): HttpBridgeRuntimeConfig => {
  return Object.freeze({
    url: config.url,
    secret: config.secret,
  });
};

const publishViaHttpBridgeDriver = async (
  config: HttpBridgeRuntimeConfig,
  input: NormalizedBroadcastPublishInput
): Promise<BroadcastPublishResult> => {
  const bridgeConfig = Object.freeze({
    endpoints: buildEndpointCandidates([
      resolveExplicitEndpoint(config.url, resolveBroadcastAppId()),
    ]),
    secret: config.secret.trim(),
  });

  const bridgeResult = await tryPublishViaConfiguredBridge(input, bridgeConfig);
  if (bridgeResult.result !== null) {
    return {
      ok: true,
      transport: 'driver',
      channels: bridgeResult.result.channels,
      event: bridgeResult.result.event,
      deliveries: bridgeResult.result.deliveries,
      driver: 'http-bridge',
      endpoint: bridgeResult.result.endpoint,
      result: bridgeResult.result.result,
    };
  }

  if (bridgeResult.error instanceof Error) {
    throw bridgeResult.error;
  }

  throw ErrorFactory.createConfigError(
    'HTTP bridge broadcast driver misconfigured: BROADCAST_BRIDGE_URL is required'
  );
};

const tryPublishNonDriverTransports = async (
  normalized: NormalizedBroadcastPublishInput,
  selectedConfig: KnownBroadcastDriverConfig
): Promise<
  Readonly<{
    result: BroadcastPublishResult | null;
    attemptedTransports: readonly BroadcastTransport[];
    lastTransportError?: unknown;
  }>
> => {
  const attemptedTransports: BroadcastTransport[] = [];
  let lastTransportError: unknown;

  if (shouldUseAutomaticHttpBridge(selectedConfig, normalized)) {
    attemptedTransports.push('internal-http');
    const bridgeResult = await tryPublishViaConfiguredBridge(normalized, getBridgePublishConfig());
    if (bridgeResult.result !== null) {
      return { result: bridgeResult.result, attemptedTransports, lastTransportError };
    }
    if (bridgeResult.error !== undefined) {
      lastTransportError = bridgeResult.error;
    }
  }

  attemptedTransports.push('internal-http');
  const internalHttpResult = await tryPublishViaInternalHttp(normalized);
  if (internalHttpResult.result !== null) {
    return { result: internalHttpResult.result, attemptedTransports, lastTransportError };
  }
  if (internalHttpResult.error !== undefined) {
    lastTransportError = internalHttpResult.error;
  }

  attemptedTransports.push('socket');
  const socketResult = await tryPublishViaSocket(normalized);
  if (socketResult.result !== null) {
    return { result: socketResult.result, attemptedTransports, lastTransportError };
  }
  if (socketResult.error !== undefined) {
    lastTransportError = socketResult.error;
    logTransportFallback('socket', {
      error: describeError(socketResult.error),
    });
  }

  return { result: null, attemptedTransports, lastTransportError };
};

const publishWithConfig = async (
  config: KnownBroadcastDriverConfig,
  broadcasterName: string | undefined,
  input: NormalizedBroadcastPublishInput
): Promise<BroadcastPublishResult> => {
  if (config.driver === 'http-bridge') {
    return {
      ...(await publishViaHttpBridgeDriver(toHttpBridgeRuntimeConfig(config), input)),
      ...(broadcasterName === undefined ? {} : { broadcaster: broadcasterName }),
    };
  }

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
  const selectedConfig = await resolveBroadcasterConfig(normalized.broadcaster);
  const autoTransportResult =
    normalized.delivery === 'driver'
      ? { result: null, attemptedTransports: [] as readonly BroadcastTransport[] }
      : await tryPublishNonDriverTransports(normalized, selectedConfig);

  if (autoTransportResult.result !== null) {
    return {
      ...autoTransportResult.result,
      attemptedTransports: autoTransportResult.attemptedTransports,
    };
  }

  if (normalized.delivery === 'socket') {
    if (autoTransportResult.lastTransportError instanceof Error) {
      throw autoTransportResult.lastTransportError;
    }

    throw ErrorFactory.createConfigError('Socket publish delivery is not available.');
  }

  const attemptedTransports: readonly BroadcastTransport[] = [
    ...autoTransportResult.attemptedTransports,
    'driver',
  ];
  return {
    ...(await publishWithConfig(selectedConfig, normalized.broadcaster, normalized)),
    attemptedTransports,
  };
};

const publishLaterInternal = async (
  input: BroadcastPublishInput,
  options: { queueName?: string; timestamp?: number } = {}
): Promise<string> => {
  const normalized = normalizePublishInput(input);
  const { queueName = 'broadcasts', timestamp = Date.now() } = options;
  const { Queue } = await import('@tools/queue/Queue');

  const payload: QueuedBroadcastPayload = {
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
  };

  Logger.debug('Broadcast queued publish prepared', {
    queueName,
    channels: payload.channels,
    compatibilityChannel: payload.channel,
    event: payload.event,
    delivery: payload.delivery,
    broadcaster: payload.broadcaster,
    timestamp: payload.timestamp,
  });

  return Queue.enqueue(queueName, payload);
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
