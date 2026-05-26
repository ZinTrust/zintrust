import { Cloudflare } from '@zintrust/core/cloudflare';
import { broadcastConfig, middlewareConfig } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import { Router, type IRequest, type IResponse, type IRouter } from '@zintrust/core/http';
import { Logger } from '@zintrust/core/logger';
import {
  SocketFeature,
  type SocketAuthorizationContext,
  type SocketAuthorizationDecision,
  type SocketAuthorizer,
  type SocketAuthorizerHandler,
  type SocketFeatureSettings,
  type SocketNodeUpgradeInput,
  type SocketPublishDecision,
  type SocketPublishPolicy,
  type SocketPublishPolicyHandler,
  type SocketRouteRegistrar,
  type SocketRuntime,
  type SocketRuntimeDiagnostics,
  type SocketWorkerContext,
} from '@zintrust/core/runtime';
import { isArray, isNonEmptyString } from '@zintrust/core/utils';

type NodeSocket = import('node:net').Socket;

type SocketPeer = {
  id: string;
  subscriptions: Set<string>;
  sendText: (text: string) => void;
  close: (code?: number, reason?: string) => void;
};

type SocketState = {
  peers: Map<string, SocketPeer>;
  channels: Map<string, Set<string>>;
};

type SocketForwardPublishPayload = {
  channels: string[];
  event: string;
  data: unknown;
  socket_id?: string;
};

type ServerSideSocketPublishInput = Readonly<{
  channels: readonly string[];
  event: string;
  data: unknown;
  socketId?: string;
  request?: IRequest;
  user?: unknown;
}>;

type WorkerMessageEvent = Event & { data?: unknown };

type SubscribePayload = {
  channel?: unknown;
  auth?: unknown;
  channel_data?: unknown;
};

type PublishPayload = {
  channel?: unknown;
  channels?: unknown;
  name?: unknown;
  event?: unknown;
  data?: unknown;
  socket_id?: unknown;
};

type WorkerResponseInit = NonNullable<ConstructorParameters<typeof Response>[1]> & {
  webSocket?: WebSocket;
};

type WorkerServerSocket = WebSocket & { accept: () => void };
type WebSocketPairCtor = new () => { 0: WebSocket; 1: WorkerServerSocket };

type SocketDurableObjectStub = {
  fetch: (request: Request) => Promise<Response>;
};

type SocketDurableObjectNamespace = {
  getByName?: (name: string) => SocketDurableObjectStub;
  idFromName?: (name: string) => unknown;
  get?: (id: unknown) => SocketDurableObjectStub;
};

type SocketGlobal = typeof globalThis & {
  __zintrustSocketState?: SocketState;
};

const encoder = new TextEncoder();
const websocketGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const socketHubBindingName = 'ZT_SOCKET_HUB';
const socketInternalPublishPath = '/__zintrust/socket/publish';
const jsonHeaders = Object.freeze({ 'content-type': 'application/json; charset=utf-8' });

const createSocketState = (): SocketState => {
  return {
    peers: new Map<string, SocketPeer>(),
    channels: new Map<string, Set<string>>(),
  };
};

const getNodeSocketState = (): SocketState => {
  const globalSocketState = globalThis as SocketGlobal;
  globalSocketState.__zintrustSocketState ??= createSocketState();
  return globalSocketState.__zintrustSocketState;
};

const toEnvRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
};

const readEnvString = (
  source: Record<string, unknown> | null,
  key: string,
  fallback = ''
): string => {
  const value = source?.[key];
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
};

const readEnvBool = (
  source: Record<string, unknown> | null,
  key: string,
  fallback: boolean
): boolean => {
  const raw = readEnvString(source, key, fallback ? 'true' : 'false')
    .trim()
    .toLowerCase();
  if (raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
};

const readEnvInt = (
  source: Record<string, unknown> | null,
  key: string,
  fallback: number
): number => {
  const raw = readEnvString(source, key, String(fallback)).trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSocketPath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return '/app';

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  let end = normalized.length;
  while (end > 1 && normalized[end - 1] === '/') {
    end -= 1;
  }

  return end === normalized.length ? normalized : normalized.slice(0, end);
};

const pickFirstNonEmpty = (...values: string[]): string => {
  for (const value of values) {
    if (value.trim() !== '') {
      return value.trim();
    }
  }

  return '';
};

const resolveTransport = (value: string): SocketFeatureSettings['transport'] => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'node' || normalized === 'cloudflare') {
    return normalized;
  }

  return 'auto';
};

const getSocketRuntimeSettings = (envSource?: unknown): SocketFeatureSettings => {
  const source = toEnvRecord(envSource);
  if (source === null) {
    const settings = SocketFeature.getSettings();
    return Object.freeze({
      ...settings,
      appId: settings.appId === '' ? 'local' : settings.appId,
    });
  }

  return Object.freeze({
    enabled: readEnvBool(source, 'SOCKET_ENABLED', false),
    transport: resolveTransport(readEnvString(source, 'SOCKET_TRANSPORT', 'auto')),
    path: normalizeSocketPath(readEnvString(source, 'SOCKET_PATH', '/app')),
    appId:
      pickFirstNonEmpty(
        readEnvString(source, 'PUSHER_APP_ID', ''),
        readEnvString(source, 'BROADCAST_APP_ID', '')
      ) || 'local',
    appKey: pickFirstNonEmpty(
      readEnvString(source, 'PUSHER_APP_KEY', ''),
      readEnvString(source, 'BROADCAST_AUTH_KEY', ''),
      readEnvString(source, 'BROADCAST_APP_KEY', '')
    ),
    secret: pickFirstNonEmpty(
      readEnvString(source, 'PUSHER_APP_SECRET', ''),
      readEnvString(source, 'BROADCAST_SECRET', ''),
      readEnvString(source, 'BROADCAST_APP_SECRET', '')
    ),
    activityTimeout: readEnvInt(source, 'BROADCAST_ACTIVITY_TIMEOUT', 120),
  });
};

const toJsonString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? {});
};

const createJsonResponse = (payload: unknown, status: number): Response => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
};

const decodeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    );
  }
  return '';
};

const getUpgradeHeader = (value: string | string[] | null): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const getBearerToken = (value: string): string => {
  const normalized = value.trim();
  if (!normalized.toLowerCase().startsWith('bearer ')) return '';
  return normalized.slice('bearer '.length).trim();
};

const parseSocketPath = (pathname: string, settings: SocketFeatureSettings): string | null => {
  const prefix = `${settings.path}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const remainder = pathname.slice(prefix.length);
  if (remainder === '' || remainder.includes('/')) {
    return null;
  }

  return decodeURIComponent(remainder);
};

const isWorkerUpgradeRequest = (request: Request): boolean => {
  return request.headers.get('upgrade')?.trim().toLowerCase() === 'websocket';
};

const isNodeUpgradeRequest = (
  input: SocketNodeUpgradeInput,
  settings: SocketFeatureSettings
): boolean => {
  const pathname = new URL(input.request.url ?? '/', 'http://localhost').pathname;
  return parseSocketPath(pathname, settings) !== null;
};

const toBase64 = (value: ArrayBuffer): string => {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary);
};

const toHex = (value: ArrayBuffer): string => {
  return Array.from(new Uint8Array(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const sha1Base64 = async (value: string): Promise<string> => {
  return toBase64(await globalThis.crypto.subtle.digest('SHA-1', encoder.encode(value)));
};

const hmacSha256Hex = async (secret: string, value: string): Promise<string> => {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return toHex(signature);
};

const createSocketId = (): string => {
  const token = globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  const left = Number.parseInt(token.slice(0, 8), 16).toString();
  const right = Number.parseInt(token.slice(8, 16), 16).toString();
  return `${left}.${right}`;
};

const removeFromChannel = (state: SocketState, channel: string, peerId: string): void => {
  const members = state.channels.get(channel);
  if (members === undefined) return;

  members.delete(peerId);
  if (members.size === 0) {
    state.channels.delete(channel);
  }
};

const detachPeer = (state: SocketState, peer: SocketPeer): void => {
  state.peers.delete(peer.id);
  for (const channel of peer.subscriptions) {
    removeFromChannel(state, channel, peer.id);
  }
  peer.subscriptions.clear();
};

const addPeerToChannel = (state: SocketState, channel: string, peer: SocketPeer): void => {
  const existing = state.channels.get(channel);
  if (existing === undefined) {
    state.channels.set(channel, new Set([peer.id]));
  } else {
    existing.add(peer.id);
  }
  peer.subscriptions.add(channel);
};

const createEnvelope = (event: string, data: unknown, channel?: string): string => {
  const payload: Record<string, unknown> = {
    event,
    data: toJsonString(data),
  };

  if (channel !== undefined) {
    payload['channel'] = channel;
  }

  return JSON.stringify(payload);
};

const emitConnectionEstablished = (peer: SocketPeer, settings: SocketFeatureSettings): void => {
  peer.sendText(
    createEnvelope('pusher:connection_established', {
      socket_id: peer.id,
      activity_timeout: settings.activityTimeout,
    })
  );
};

const emitSubscriptionSucceeded = (peer: SocketPeer, channel: string): void => {
  peer.sendText(createEnvelope('pusher_internal:subscription_succeeded', {}, channel));
};

const emitPong = (peer: SocketPeer): void => {
  peer.sendText(createEnvelope('pusher:pong', {}));
};

const getPublishSecret = (request: IRequest): string => {
  const directHeader = request.getHeader('x-zintrust-socket-secret');
  const authHeader = request.getHeader('authorization');

  const fromDirect = getUpgradeHeader(
    typeof directHeader === 'string' ? directHeader : null
  ).trim();
  if (fromDirect !== '') return fromDirect;

  return getBearerToken(getUpgradeHeader(typeof authHeader === 'string' ? authHeader : null));
};

const validatePrivateChannelAuth = async (
  peer: SocketPeer,
  channel: string,
  authValue: string,
  channelData: string | undefined,
  settings: SocketFeatureSettings
): Promise<boolean> => {
  if (settings.secret.trim() === '' || settings.appKey.trim() === '') {
    return false;
  }

  const [authKey, signature] = authValue.split(':');
  if (authKey !== settings.appKey || !isNonEmptyString(signature)) {
    return false;
  }

  const payload =
    channelData === undefined ? `${peer.id}:${channel}` : `${peer.id}:${channel}:${channelData}`;
  return (await hmacSha256Hex(settings.secret, payload)) === signature;
};

const isPrivateChannel = (channel: string): boolean => {
  return channel.startsWith('private-') || channel.startsWith('presence-');
};

const publishToChannels = (
  state: SocketState,
  channels: string[],
  event: string,
  data: unknown,
  excludeSocketId?: string
): number => {
  const delivered = new Set<string>();

  for (const channel of channels) {
    const members = state.channels.get(channel);
    if (members === undefined) continue;

    for (const peerId of members) {
      if (peerId === excludeSocketId) continue;

      const peer = state.peers.get(peerId);
      if (peer === undefined) continue;
      peer.sendText(createEnvelope(event, data, channel));
      delivered.add(peerId);
    }
  }

  return delivered.size;
};

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const handleSubscribe = async (
  state: SocketState,
  peer: SocketPeer,
  payload: SubscribePayload,
  settings: SocketFeatureSettings
): Promise<void> => {
  const channel = isNonEmptyString(payload.channel) ? payload.channel.trim() : '';
  if (channel === '') {
    return;
  }

  if (isPrivateChannel(channel)) {
    const auth = isNonEmptyString(payload.auth) ? payload.auth.trim() : '';
    const channelData = isNonEmptyString(payload.channel_data) ? payload.channel_data : undefined;
    if (!(await validatePrivateChannelAuth(peer, channel, auth, channelData, settings))) {
      peer.sendText(createEnvelope('pusher:error', { message: 'Subscription auth failed.' }));
      return;
    }
  }

  addPeerToChannel(state, channel, peer);
  emitSubscriptionSucceeded(peer, channel);
};

const handleClientMessage = async (
  state: SocketState,
  peer: SocketPeer,
  text: string,
  settings: SocketFeatureSettings
): Promise<void> => {
  const payload = parseJsonObject(text);
  if (payload === null) {
    return;
  }

  const eventName = isNonEmptyString(payload['event']) ? payload['event'].trim() : '';
  const dataRaw = payload['data'];
  const data = typeof dataRaw === 'string' ? (parseJsonObject(dataRaw) ?? dataRaw) : dataRaw;

  if (eventName === 'pusher:ping') {
    emitPong(peer);
    return;
  }

  if (eventName === 'pusher:subscribe' && data !== null && typeof data === 'object') {
    await handleSubscribe(state, peer, data as SubscribePayload, settings);
    return;
  }

  if (eventName === 'pusher:unsubscribe' && data !== null && typeof data === 'object') {
    const candidate = (data as SubscribePayload).channel;
    const channel = isNonEmptyString(candidate) ? candidate.trim() : '';
    if (channel !== '') {
      peer.subscriptions.delete(channel);
      removeFromChannel(state, channel, peer.id);
    }
  }
};

const encodeFrame = (opcode: number, payload: Uint8Array): Buffer => {
  const header: number[] = [0x80 | (opcode & 0x0f)];

  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length <= 0xffff) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    const high = Math.floor(payload.length / 2 ** 32);
    const low = payload.length >>> 0;
    header.push(
      127,
      (high >> 24) & 0xff,
      (high >> 16) & 0xff,
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 24) & 0xff,
      (low >> 16) & 0xff,
      (low >> 8) & 0xff,
      low & 0xff
    );
  }

  return Buffer.concat([Buffer.from(header), Buffer.from(payload)]);
};

const parseFrame = (
  buffer: Buffer
): { opcode: number; payload: Buffer; bytesConsumed: number } | null => {
  if (buffer.length < 2) return null;

  const second = buffer[1];
  const opcode = buffer[0] & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    const high = buffer.readUInt32BE(2);
    const low = buffer.readUInt32BE(6);
    length = high * 2 ** 32 + low;
    offset = 10;
  }

  const maskOffset = masked ? 4 : 0;
  if (buffer.length < offset + maskOffset + length) {
    return null;
  }

  const payload = buffer.subarray(offset + maskOffset, offset + maskOffset + length);
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    const decoded = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      decoded[index] = payload[index] ^ mask[index % 4];
    }

    return { opcode, payload: decoded, bytesConsumed: offset + 4 + length };
  }

  return { opcode, payload, bytesConsumed: offset + length };
};

const createNodePeer = (state: SocketState, socket: NodeSocket): SocketPeer => {
  const peer: SocketPeer = {
    id: createSocketId(),
    subscriptions: new Set<string>(),
    sendText(text: string): void {
      socket.write(encodeFrame(0x1, encoder.encode(text)));
    },
    close(code = 1000, reason = ''): void {
      const body = Buffer.alloc(2 + Buffer.byteLength(reason));
      body.writeUInt16BE(code, 0);
      body.write(reason, 2);
      socket.write(encodeFrame(0x8, body));
      socket.end();
    },
  };

  state.peers.set(peer.id, peer);
  socket.on('close', () => detachPeer(state, peer));
  socket.on('error', () => detachPeer(state, peer));
  return peer;
};

const createWorkerPeer = (state: SocketState, socket: WebSocket): SocketPeer => {
  const peer: SocketPeer = {
    id: createSocketId(),
    subscriptions: new Set<string>(),
    sendText(text: string): void {
      socket.send(text);
    },
    close(code = 1000, reason = ''): void {
      socket.close(code, reason);
    },
  };

  state.peers.set(peer.id, peer);
  return peer;
};

const attachNodePeer = async (
  state: SocketState,
  input: SocketNodeUpgradeInput,
  settings: SocketFeatureSettings
): Promise<boolean> => {
  const key = input.request.headers['sec-websocket-key'];
  const secKey = Array.isArray(key) ? key[0] : key;
  if (!isNonEmptyString(secKey)) {
    return false;
  }

  const acceptKey = await sha1Base64(`${secKey.trim()}${websocketGuid}`);
  input.socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n')
  );

  const peer = createNodePeer(state, input.socket);
  emitConnectionEstablished(peer, settings);

  let frameBuffer = input.head.length > 0 ? Buffer.from(input.head) : Buffer.alloc(0);
  const consumeFrames = async (): Promise<void> => {
    while (true) {
      const frame = parseFrame(frameBuffer);
      if (frame === null) return;
      frameBuffer = frameBuffer.subarray(frame.bytesConsumed);

      if (frame.opcode === 0x8) {
        peer.close();
        return;
      }

      if (frame.opcode === 0x9) {
        input.socket.write(encodeFrame(0xa, frame.payload));
        continue;
      }

      if (frame.opcode === 0x1) {
        // eslint-disable-next-line no-await-in-loop
        await handleClientMessage(state, peer, frame.payload.toString('utf-8'), settings);
      }
    }
  };

  input.socket.on('data', (chunk: Buffer) => {
    frameBuffer = Buffer.concat([frameBuffer, chunk]);
    void consumeFrames();
  });

  if (frameBuffer.length > 0) {
    await consumeFrames();
  }

  return true;
};

const attachWorkerPeer = (
  state: SocketState,
  socket: WebSocket,
  settings: SocketFeatureSettings
): void => {
  const peer = createWorkerPeer(state, socket);
  emitConnectionEstablished(peer, settings);

  socket.addEventListener('message', (event: Event) => {
    void handleClientMessage(state, peer, decodeText((event as WorkerMessageEvent).data), settings);
  });
  socket.addEventListener('close', () => detachPeer(state, peer));
  socket.addEventListener('error', () => detachPeer(state, peer));
};

const getSocketAppKey = (requestPath: string, settings: SocketFeatureSettings): string | null => {
  return parseSocketPath(requestPath, settings);
};

const getSocketHubNamespace = (envSource?: unknown): SocketDurableObjectNamespace | null => {
  const source = toEnvRecord(envSource) ?? Cloudflare.getWorkersEnv();
  if (source === null) {
    return null;
  }

  const candidate = source[socketHubBindingName];
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const namespace = candidate as SocketDurableObjectNamespace;
  if (typeof namespace.getByName === 'function') {
    return namespace;
  }

  if (typeof namespace.idFromName === 'function' && typeof namespace.get === 'function') {
    return namespace;
  }

  return null;
};

const getSocketHubStub = (
  settings: SocketFeatureSettings,
  envSource?: unknown
): SocketDurableObjectStub | null => {
  const namespace = getSocketHubNamespace(envSource);
  if (namespace === null) {
    return null;
  }

  const objectName = `socket-app:${settings.appId}:${settings.appKey}`;
  if (typeof namespace.getByName === 'function') {
    return namespace.getByName(objectName);
  }

  if (typeof namespace.idFromName === 'function' && typeof namespace.get === 'function') {
    return namespace.get(namespace.idFromName(objectName));
  }

  return null;
};

const createMissingHubResponse = (): Response => {
  return createJsonResponse(
    {
      error: 'socket_durable_object_missing',
      message: 'Cloudflare socket transport requires a Durable Object binding named ZT_SOCKET_HUB.',
    },
    503
  );
};

const shouldUseCloudflareHub = (settings: SocketFeatureSettings): boolean => {
  if (settings.transport === 'node') {
    return false;
  }

  return Cloudflare.getWorkersEnv() !== null;
};

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
};

const isSocketAuthorizerHandler = (value: unknown): value is SocketAuthorizerHandler => {
  return typeof value === 'function';
};

const isSocketAuthorizer = (value: unknown): value is SocketAuthorizer => {
  const candidate = value as { authorize?: unknown } | null;
  return typeof value === 'object' && value !== null && typeof candidate?.authorize === 'function';
};

const createDefaultSocketAuthorizer = (): SocketAuthorizer => {
  return Object.freeze({
    async authorize(
      _request: IRequest,
      context: SocketAuthorizationContext
    ): Promise<SocketAuthorizationDecision> {
      if (
        context.channelName.startsWith('private-') ||
        context.channelName.startsWith('presence-')
      ) {
        return {
          authorized: context.user !== null && context.user !== undefined,
        };
      }

      return {
        authorized: false,
      };
    },
  });
};

const resolveSocketAuthorizer = (): SocketAuthorizer => {
  const configured = broadcastConfig.socket.authorize;
  if (configured === undefined) {
    return createDefaultSocketAuthorizer();
  }

  if (isSocketAuthorizerHandler(configured)) {
    return Object.freeze({
      authorize: configured,
    });
  }

  if (isSocketAuthorizer(configured)) {
    return configured;
  }

  throw ErrorFactory.createConfigError(
    'broadcastConfig.socket.authorize must be a function or an object with an authorize(request, context) method.'
  );
};

const isSocketPublishPolicyHandler = (value: unknown): value is SocketPublishPolicyHandler => {
  return typeof value === 'function';
};

const isSocketPublishPolicy = (value: unknown): value is SocketPublishPolicy => {
  const candidate = value as { authorize?: unknown } | null;
  return typeof value === 'object' && value !== null && typeof candidate?.authorize === 'function';
};

const createDefaultSocketPublishPolicy = (): SocketPublishPolicy => {
  return Object.freeze({
    async authorize(): Promise<SocketPublishDecision> {
      return {
        allowed: true,
      };
    },
  });
};

const resolveSocketPublishPolicy = (): SocketPublishPolicy => {
  const configured = broadcastConfig.socket.publish;
  if (configured === undefined) {
    return createDefaultSocketPublishPolicy();
  }

  if (isSocketPublishPolicyHandler(configured)) {
    return Object.freeze({
      authorize: configured,
    });
  }

  if (isSocketPublishPolicy(configured)) {
    return configured;
  }

  throw ErrorFactory.createConfigError(
    'broadcastConfig.socket.publish must be a function or an object with an authorize(request, context) method.'
  );
};

const resolveSocketAuthMiddleware = (): string[] => {
  const configured = (broadcastConfig.socket.authMiddleware as readonly unknown[])
    .filter((value): value is string => isNonEmptyString(value))
    .map((value) => value.trim())
    .filter((value) => value !== '');
  const middleware = configured.length > 0 ? configured : ['auth'];
  const known = new Set(Object.keys(middlewareConfig.route));
  const unknown = middleware.filter((value) => !known.has(value));

  if (unknown.length > 0) {
    throw ErrorFactory.createConfigError(
      `Unknown socket auth middleware configured: ${unknown.join(', ')}`
    );
  }

  return middleware;
};

const isSocketAuthRouteOverrideEnabled = (): boolean => {
  return broadcastConfig.socket.allowAuthRouteOverride === true;
};

const routeExists = (router: IRouter, method: string, path: string): boolean => {
  return router.routes.some(
    (route: { method: string; path: string }) => route.method === method && route.path === path
  );
};

const assertReservedSocketRouteAvailable = (
  router: IRouter,
  method: string,
  path: string,
  options?: { allowOverride?: boolean }
): void => {
  if (!routeExists(router, method, path)) {
    return;
  }

  if (options?.allowOverride === true && isSocketAuthRouteOverrideEnabled()) {
    return;
  }

  throw ErrorFactory.createConfigError(
    `Socket compatibility route ${method} ${path} is reserved while sockets are enabled.`
  );
};

const createSocketAuthPayload = async (
  settings: SocketFeatureSettings,
  socketId: string,
  channelName: string,
  channelData?: string
): Promise<{ auth: string; channel_data?: string }> => {
  if (settings.secret.trim() === '' || settings.appKey.trim() === '') {
    throw ErrorFactory.createConfigError('Socket auth is not configured.');
  }

  const signature = await hmacSha256Hex(
    settings.secret,
    channelData === undefined
      ? `${socketId}:${channelName}`
      : `${socketId}:${channelName}:${channelData}`
  );

  return {
    auth: `${settings.appKey}:${signature}`,
    ...(channelData === undefined ? {} : { channel_data: channelData }),
  };
};

const parsePublishPayload = (payload: PublishPayload): SocketForwardPublishPayload | null => {
  let event = '';
  if (isNonEmptyString(payload.name)) {
    event = payload.name.trim();
  } else if (isNonEmptyString(payload.event)) {
    event = payload.event.trim();
  }

  let channels: string[] = [];
  if (isArray(payload.channels)) {
    channels = payload.channels
      .filter((item): item is string => isNonEmptyString(item))
      .map((item) => item.trim());
  } else if (isNonEmptyString(payload.channel)) {
    channels = [payload.channel.trim()];
  }

  if (event === '' || channels.length === 0) {
    return null;
  }

  return {
    channels,
    event,
    data: payload.data ?? {},
    ...(isNonEmptyString(payload.socket_id) ? { socket_id: payload.socket_id.trim() } : {}),
  };
};

const normalizePublishDecisionPayload = (
  payload: SocketForwardPublishPayload,
  decision: SocketPublishDecision
): SocketForwardPublishPayload | null => {
  const event = isNonEmptyString(decision.event) ? decision.event.trim() : payload.event;
  const decisionChannels = decision.channels as readonly unknown[] | undefined;
  const channels = isArray(decisionChannels)
    ? decisionChannels
        .filter((item): item is string => isNonEmptyString(item))
        .map((item) => item.trim())
    : payload.channels;

  if (event === '' || channels.length === 0) {
    return null;
  }

  return {
    channels,
    event,
    data: decision.data === undefined ? payload.data : decision.data,
    ...((): Partial<Pick<SocketForwardPublishPayload, 'socket_id'>> => {
      if (isNonEmptyString(decision.socketId)) {
        return { socket_id: decision.socketId.trim() };
      }

      if (payload.socket_id === undefined) {
        return {};
      }

      return { socket_id: payload.socket_id };
    })(),
  };
};

const createServerSidePublishRequest = (input: ServerSideSocketPublishInput): IRequest => {
  return {
    getBody: () => null,
    getHeader: () => undefined,
    getParam: () => undefined,
    user: input.user ?? null,
  } as unknown as IRequest;
};

const getResponseDeliveries = (payload: unknown): number => {
  if (typeof payload !== 'object' || payload === null) {
    return 0;
  }

  const deliveries = (payload as { deliveries?: unknown }).deliveries;
  return typeof deliveries === 'number' && Number.isFinite(deliveries) ? deliveries : 0;
};

const publishSocketEventFromServer = async (
  input: ServerSideSocketPublishInput
): Promise<{
  ok: true;
  transport: 'node' | 'cloudflare';
  channels: readonly string[];
  event: string;
  deliveries: number;
}> => {
  const settings = getSocketRuntimeSettings(Cloudflare.getWorkersEnv());
  if (!settings.enabled || settings.appKey.trim() === '') {
    throw ErrorFactory.createConfigError('Socket runtime is not enabled.');
  }

  const request = input.request ?? createServerSidePublishRequest(input);
  const payload: SocketForwardPublishPayload = {
    channels: input.channels.map((channel) => channel.trim()),
    event: input.event.trim(),
    data: input.data ?? {},
    ...(isNonEmptyString(input.socketId) ? { socket_id: input.socketId.trim() } : {}),
  };

  const publishPolicy = resolveSocketPublishPolicy();
  const decision = await publishPolicy.authorize(request, {
    appId: settings.appId,
    channels: payload.channels,
    event: payload.event,
    data: payload.data,
    socketId: payload.socket_id,
    user: input.user ?? request.user ?? null,
  });

  if (decision.allowed !== true) {
    throw ErrorFactory.createForbiddenError(decision.message ?? 'Forbidden', {
      statusCode: decision.statusCode ?? 403,
    });
  }

  const allowedPayload = normalizePublishDecisionPayload(payload, decision);
  if (allowedPayload === null) {
    throw ErrorFactory.createValidationError(
      'Socket publish policy must return a non-empty event and channels.'
    );
  }

  if (shouldUseCloudflareHub(settings)) {
    const response = await forwardPublishToHub(
      settings,
      allowedPayload,
      Cloudflare.getWorkersEnv()
    );
    const responseBody = await parseJsonResponse(response);
    if (!response.ok) {
      throw ErrorFactory.createTryCatchError(`Socket publish request failed (${response.status})`, {
        status: response.status,
        body: responseBody,
      });
    }

    return {
      ok: true,
      transport: 'cloudflare',
      channels: allowedPayload.channels,
      event: allowedPayload.event,
      deliveries: getResponseDeliveries(responseBody),
    };
  }

  return {
    ok: true,
    transport: 'node',
    channels: allowedPayload.channels,
    event: allowedPayload.event,
    deliveries: publishToChannels(
      getNodeSocketState(),
      allowedPayload.channels,
      allowedPayload.event,
      allowedPayload.data,
      allowedPayload.socket_id
    ),
  };
};

const forwardPublishToHub = async (
  settings: SocketFeatureSettings,
  payload: SocketForwardPublishPayload,
  envSource?: unknown
): Promise<Response> => {
  const stub = getSocketHubStub(settings, envSource);
  if (stub === null) {
    return createMissingHubResponse();
  }

  return stub.fetch(
    new Request(`https://zintrust-socket.internal${socketInternalPublishPath}`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    })
  );
};

const getWebSocketPairCtor = (): WebSocketPairCtor | undefined => {
  return (globalThis as typeof globalThis & { WebSocketPair?: WebSocketPairCtor }).WebSocketPair;
};

const createSocketRuntime = (): SocketRuntime => {
  const shouldEnable = (): boolean => {
    const settings = getSocketRuntimeSettings();
    return settings.enabled && settings.appKey.trim() !== '';
  };

  const describe = (): SocketRuntimeDiagnostics => {
    const settings = getSocketRuntimeSettings();
    const transport: SocketRuntimeDiagnostics['transport'] =
      typeof getWebSocketPairCtor() === 'function' ? 'cloudflare' : 'node';

    return {
      enabled: shouldEnable(),
      transport,
      path: settings.path,
      appKeyConfigured: settings.appKey.trim() !== '',
    };
  };

  return Object.freeze({
    name: '@zintrust/socket',
    isEnabled: shouldEnable,
    describe,
    canHandleNodeUpgrade(input: SocketNodeUpgradeInput) {
      const settings = getSocketRuntimeSettings();
      if (settings.transport === 'cloudflare') return false;
      return isNodeUpgradeRequest(input, settings);
    },
    async handleNodeUpgrade(input: SocketNodeUpgradeInput) {
      const settings = getSocketRuntimeSettings();
      const pathname = new URL(input.request.url ?? '/', 'http://localhost').pathname;
      const appKey = getSocketAppKey(pathname, settings);
      if (appKey === null || appKey !== settings.appKey) {
        return false;
      }

      return attachNodePeer(getNodeSocketState(), input, settings);
    },
    canHandleWorkerRequest(request: Request) {
      const settings = getSocketRuntimeSettings();
      if (settings.transport === 'node') return false;
      if (!isWorkerUpgradeRequest(request)) return false;
      return getSocketAppKey(new URL(request.url).pathname, settings) !== null;
    },
    async handleWorkerRequest(request: Request, context: SocketWorkerContext) {
      const settings = getSocketRuntimeSettings(context.env);
      const appKey = getSocketAppKey(new URL(request.url).pathname, settings);
      if (appKey === null || appKey !== settings.appKey) {
        return null;
      }

      const stub = getSocketHubStub(settings, context.env);
      if (stub === null) {
        return createMissingHubResponse();
      }

      return stub.fetch(request);
    },
  });
};

const socketRuntime = createSocketRuntime();

const respondUpgradeRequired = (req: IRequest, res: IResponse): void => {
  const settings = getSocketRuntimeSettings();
  const appKey = req.getParam('appKey');
  if (!isNonEmptyString(appKey) || appKey.trim() !== settings.appKey) {
    res.setStatus(404).json({ error: 'Socket app key not found.' });
    return;
  }

  res.setStatus(426).json({
    error: 'Upgrade Required',
    message: 'Open this endpoint with a WebSocket upgrade request.',
    path: `${settings.path}/${settings.appKey}`,
  });
};

const authenticateSubscription = async (req: IRequest, res: IResponse): Promise<void> => {
  const settings = getSocketRuntimeSettings();
  const body = req.getBody();
  const payload =
    body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const socketId = isNonEmptyString(payload['socket_id']) ? payload['socket_id'].trim() : '';
  const channelName = isNonEmptyString(payload['channel_name'])
    ? payload['channel_name'].trim()
    : '';
  const channelData = isNonEmptyString(payload['channel_data'])
    ? payload['channel_data'].trim()
    : undefined;

  if (socketId === '' || channelName === '') {
    res.setStatus(400).json({ error: 'socket_id and channel_name are required.' });
    return;
  }

  const authorizer = resolveSocketAuthorizer();
  const decision = await authorizer.authorize(req, {
    channelName,
    socketId,
    user: req.user ?? null,
    channelData,
  });

  if (decision.authorized !== true) {
    res.setStatus(403).json({ message: 'Forbidden' });
    return;
  }

  const resolvedChannelData = isNonEmptyString(decision.channelData)
    ? decision.channelData.trim()
    : channelData;
  if (isNonEmptyString(decision.auth)) {
    res.json({
      auth: decision.auth.trim(),
      ...(resolvedChannelData === undefined ? {} : { channel_data: resolvedChannelData }),
    });
    return;
  }

  res.json(await createSocketAuthPayload(settings, socketId, channelName, resolvedChannelData));
};

const publishEvent = async (req: IRequest, res: IResponse): Promise<void> => {
  const settings = getSocketRuntimeSettings();
  const appId = req.getParam('appId');
  if (!isNonEmptyString(appId) || appId.trim() !== settings.appId) {
    res.setStatus(404).json({ error: 'Socket app id not found.' });
    return;
  }

  if (settings.secret.trim() !== '') {
    const providedSecret = getPublishSecret(req);
    if (providedSecret !== settings.secret) {
      res.setStatus(403).json({ error: 'Socket publish secret is invalid.' });
      return;
    }
  }

  const payload = req.getBody();
  const body = payload !== null && typeof payload === 'object' ? (payload as PublishPayload) : {};
  const normalizedPayload = parsePublishPayload(body);
  if (normalizedPayload === null) {
    res.setStatus(400).json({ error: 'event/name and channel/channels are required.' });
    return;
  }

  const publishPolicy = resolveSocketPublishPolicy();
  const decision = await publishPolicy.authorize(req, {
    appId: appId.trim(),
    channels: normalizedPayload.channels,
    event: normalizedPayload.event,
    data: normalizedPayload.data,
    socketId: normalizedPayload.socket_id,
    user: req.user ?? null,
  });

  if (decision.allowed !== true) {
    res.setStatus(decision.statusCode ?? 403).json({
      message: decision.message ?? 'Forbidden',
    });
    return;
  }

  const allowedPayload = normalizePublishDecisionPayload(normalizedPayload, decision);
  if (allowedPayload === null) {
    res
      .setStatus(400)
      .json({ error: 'publish policy must return a non-empty event and channels.' });
    return;
  }

  if (shouldUseCloudflareHub(settings)) {
    const response = await forwardPublishToHub(
      settings,
      allowedPayload,
      Cloudflare.getWorkersEnv()
    );
    const responseBody = await parseJsonResponse(response);
    res.setStatus(response.status).json(responseBody);
    return;
  }

  const deliveries = publishToChannels(
    getNodeSocketState(),
    allowedPayload.channels,
    allowedPayload.event,
    allowedPayload.data,
    allowedPayload.socket_id
  );

  res.setStatus(202).json({
    ok: true,
    channels: allowedPayload.channels,
    event: allowedPayload.event,
    deliveries,
  });
};

const registerSocketRoutes = (router: IRouter): void => {
  const settings = getSocketRuntimeSettings();
  const allowAuthRouteOverride = isSocketAuthRouteOverrideEnabled();
  const hasExistingAuthRoute = routeExists(router, 'POST', '/broadcasting/auth');

  assertReservedSocketRouteAvailable(router, 'GET', `${settings.path}/:appKey`);
  assertReservedSocketRouteAvailable(router, 'POST', '/apps/:appId/events');

  Router.get(router, `${settings.path}/:appKey`, respondUpgradeRequired);
  if (hasExistingAuthRoute) {
    if (!allowAuthRouteOverride) {
      Logger.info(
        'Detected existing application-owned POST /broadcasting/auth route; preserving it while sockets are enabled.'
      );
    }
  } else {
    Router.post(router, '/broadcasting/auth', authenticateSubscription, {
      middleware: resolveSocketAuthMiddleware(),
      meta: {
        summary: 'Socket broadcast authorization',
        tags: ['Sockets'],
        responseStatus: 200,
      },
    });
  }
  Router.post(router, '/apps/:appId/events', publishEvent);
};

const socketRouteRegistrar: SocketRouteRegistrar = Object.freeze({
  registerRoutes: registerSocketRoutes,
});

export const SocketPackage = Object.freeze({
  runtime: socketRuntime,
  routeRegistrar: socketRouteRegistrar,
  publish: (channels: string[], event: string, data: unknown, excludeSocketId?: string) =>
    publishToChannels(getNodeSocketState(), channels, event, data, excludeSocketId),
  registerRoutes: registerSocketRoutes,
});

// eslint-disable-next-line no-restricted-syntax -- Cloudflare Durable Objects require class exports.
export class ZintrustSocketHub {
  private readonly settings: SocketFeatureSettings;

  private readonly state: SocketState;

  constructor(_state: unknown, env: unknown) {
    this.settings = getSocketRuntimeSettings(env);
    this.state = createSocketState();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === socketInternalPublishPath) {
      return this.handlePublishRequest(request);
    }

    if (!isWorkerUpgradeRequest(request)) {
      return createJsonResponse(
        {
          error: 'not_found',
          message: 'Unknown socket Durable Object route.',
        },
        404
      );
    }

    const appKey = getSocketAppKey(url.pathname, this.settings);
    if (appKey === null || appKey !== this.settings.appKey) {
      return createJsonResponse({ error: 'Socket app key not found.' }, 404);
    }

    const WebSocketPairRef = getWebSocketPairCtor();
    if (typeof WebSocketPairRef !== 'function') {
      return createJsonResponse({ error: 'WebSocketPair is unavailable in this runtime.' }, 501);
    }

    const pair = new WebSocketPairRef();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    attachWorkerPeer(this.state, server, this.settings);
    return new Response(null, { status: 101, webSocket: client } as WorkerResponseInit);
  }

  private async handlePublishRequest(request: Request): Promise<Response> {
    const body = parseJsonObject(await request.text());
    if (body === null) {
      return createJsonResponse({ error: 'Invalid socket publish payload.' }, 400);
    }

    const payload = parsePublishPayload(body as PublishPayload);
    if (payload === null) {
      return createJsonResponse({ error: 'event/name and channel/channels are required.' }, 400);
    }

    const deliveries = publishToChannels(
      this.state,
      payload.channels,
      payload.event,
      payload.data,
      payload.socket_id
    );

    return createJsonResponse(
      {
        ok: true,
        channels: payload.channels,
        event: payload.event,
        deliveries,
      },
      202
    );
  }
}

export const publishSocketEvent = (
  channels: string[],
  event: string,
  data: unknown,
  excludeSocketId?: string
): number => {
  return publishToChannels(getNodeSocketState(), channels, event, data, excludeSocketId);
};

export { publishSocketEventFromServer, registerSocketRoutes, socketRouteRegistrar, socketRuntime };
export default SocketPackage;
