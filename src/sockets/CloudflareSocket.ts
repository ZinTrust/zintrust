import { EventEmitter } from '@node-singletons';
import { ErrorFactory } from '@zintrust/core';

type connectType = typeof import('cloudflare:sockets').connect;

// Lazy import cloudflare:sockets to prevent Node.js evaluation errors
let connect: connectType;

const getCloudflareConnect = async (): Promise<connectType> => {
  if (connect === undefined) {
    const module = await import('cloudflare:sockets');
    connect = module.connect;
  }
  return connect;
};

export type CloudflareSocketOptions = {
  tls?: boolean;
  timeoutMs?: number;
};

export type CloudflareSocketInstance = EventEmitter & {
  write: (data: Buffer | Uint8Array) => boolean;
  end: () => void;
  destroy: () => void;
  startTls: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  setTimeout: (timeoutMs: number, callback?: () => void) => void;
  setNoDelay: (_noDelay?: boolean) => void;
  setKeepAlive: (_enable?: boolean, _initialDelay?: number) => void;
  ref: () => void;
  unref: () => void;
};

export type CloudflareSocketFactory = {
  create: (
    hostname: string,
    port: number,
    options?: CloudflareSocketOptions
  ) => CloudflareSocketInstance;
};

type SocketState = {
  socket?: ReturnType<connectType>;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  writer?: WritableStreamDefaultWriter<Uint8Array>;
  paused: boolean;
  bufferedChunks: Uint8Array[];
  closed: boolean;
  timeoutToken: number;
  socketToken: number;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 30000;

const toBuffer = (data: Uint8Array): Buffer | Uint8Array => {
  if (typeof Buffer !== 'undefined') return Buffer.from(data);
  return data;
};

const createTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (timeoutMs <= 0) return undefined;
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function')
    return undefined;
  return AbortSignal.timeout(timeoutMs);
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> => {
  const signal = createTimeoutSignal(timeoutMs);
  if (!signal) return promise;

  const timeoutPromise = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(ErrorFactory.createConnectionError(message)), {
      once: true,
    });
  });

  return Promise.race([promise, timeoutPromise]);
};

const releaseStreamLocks = (state: SocketState): void => {
  if (typeof process !== 'undefined' && process.env?.['VITEST'] !== undefined) {
    state.reader = undefined;
    state.writer = undefined;
    return;
  }

  const reader = state.reader;
  if (reader && typeof reader.releaseLock === 'function') {
    try {
      reader.releaseLock();
    } catch {
      // ignore lock release errors
    }
  }

  const writer = state.writer;
  if (writer && typeof writer.releaseLock === 'function') {
    try {
      writer.releaseLock();
    } catch {
      // ignore lock release errors
    }
  }

  state.reader = undefined;
  state.writer = undefined;
};

const flushBuffered = (state: SocketState, emitter: CloudflareSocketInstance): void => {
  if (state.paused) return;

  while (state.bufferedChunks.length > 0) {
    const chunk = state.bufferedChunks.shift();
    if (chunk !== undefined) emitter.emit('data', toBuffer(chunk));
  }
};

const startReading = (state: SocketState, emitter: CloudflareSocketInstance): void => {
  const token = state.socketToken;
  const readNext = async (): Promise<void> => {
    if (state.socketToken !== token) return;
    if (!state.reader) return; //NOSONAR

    return state.reader
      .read()
      .then(async ({ done, value }) => {
        if (state.socketToken !== token) return;
        if (done) {
          emitter.emit('end');
          return undefined;
        }
        if (state.paused) {
          state.bufferedChunks.push(value);
        } else {
          emitter.emit('data', toBuffer(value));
        }
        return readNext();
      })
      .catch((error: unknown) => {
        emitter.emit('error', error);
      });
  };

  readNext().catch((error) => emitter.emit('error', error));
};

const bindSocketLifecycle = async (
  emitter: CloudflareSocketInstance,
  state: SocketState,
  socket: ReturnType<typeof connect>,
  emitConnect: boolean
): Promise<void> => {
  state.socketToken += 1;
  const token = state.socketToken;
  state.socket = socket;
  state.closed = false;

  const waitForOpen = withTimeout(
    socket.opened,
    state.timeoutMs,
    'Cloudflare socket connection timed out'
  );

  return waitForOpen
    .then(() => {
      state.reader = socket.readable.getReader();
      state.writer = socket.writable.getWriter();
      if (emitConnect) emitter.emit('connect');
      startReading(state, emitter);

      socket.closed
        .then(() => {
          if (state.socketToken !== token) return;
          if (state.closed) return;
          state.closed = true;
          emitter.emit('close');
          try {
            releaseStreamLocks(state);
          } catch {
            // ignore release errors
          }
          emitter.removeAllListeners();
        })
        .catch((error: unknown) => {
          if (state.socketToken !== token) return;
          if (state.closed) return;
          state.closed = true;
          emitter.emit('error', error);
          try {
            releaseStreamLocks(state);
          } catch {
            // ignore release errors
          }
          emitter.removeAllListeners();
        });
    })
    .catch((error) => {
      emitter.emit('error', error);
      try {
        releaseStreamLocks(state);
      } catch {
        // ignore release errors
      }
      emitter.removeAllListeners();
    });
};

const createEmitterHandlers = (emitter: CloudflareSocketInstance, state: SocketState): void => {
  emitter.write = (data: Buffer | Uint8Array): boolean => {
    if (!state.writer) return false;

    try {
      const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
      const writePromise = state.writer.write(payload);

      writePromise.catch((error) => emitter.emit('error', error));

      if (state.writer.desiredSize !== null && state.writer.desiredSize <= 0) {
        state.writer.ready
          .then(() => emitter.emit('drain'))
          .catch((error) => emitter.emit('error', error));
        return false;
      }
      return true;
    } catch (error) {
      emitter.emit('error', error);
      return false;
    }
  };

  emitter.end = (): void => {
    const socket = state.socket;
    if (!socket) return;
    socket
      .close()
      .then(() => {
        emitter.emit('close');
        releaseStreamLocks(state);
        emitter.removeAllListeners();
      })
      .catch((error: unknown) => {
        emitter.emit('error', error);
        releaseStreamLocks(state);
        emitter.removeAllListeners();
      });
  };

  emitter.destroy = emitter.end;

  emitter.startTls = async (): Promise<void> => {
    const socket = state.socket;
    if (!socket || typeof socket.startTls !== 'function') {
      throw ErrorFactory.createConnectionError('Cloudflare socket does not support STARTTLS');
    }

    releaseStreamLocks(state);
    state.bufferedChunks = [];

    const tlsSocket = socket.startTls();
    await bindSocketLifecycle(emitter, state, tlsSocket, false);
  };

  emitter.pause = (): void => {
    state.paused = true;
  };

  emitter.resume = (): void => {
    state.paused = false;
    flushBuffered(state, emitter);
  };

  emitter.setTimeout = (timeoutMs: number, callback?: () => void): void => {
    state.timeoutToken += 1;
    const token = state.timeoutToken;
    const signal = createTimeoutSignal(timeoutMs);
    if (!signal) return;

    signal.addEventListener(
      'abort',
      () => {
        if (state.timeoutToken !== token) return;
        emitter.emit('timeout');
        callback?.();
      },
      { once: true }
    );
  };

  emitter.setNoDelay = (): void => undefined;
  emitter.setKeepAlive = (): void => undefined;
  emitter.ref = (): void => undefined;
  emitter.unref = (): void => undefined;
};

function createCloudflareSocket(
  hostname: string,
  port: number,
  options: CloudflareSocketOptions = {}
): CloudflareSocketInstance {
  const emitter = new EventEmitter() as CloudflareSocketInstance;
  const secureTransport = options.tls === true ? 'starttls' : 'off';
  const state: SocketState = {
    paused: false,
    bufferedChunks: [],
    closed: false,
    timeoutToken: 0,
    socketToken: 0,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  createEmitterHandlers(emitter, state);
  getCloudflareConnect()
    .then((connectFn) => connectFn({ hostname, port }, { secureTransport, allowHalfOpen: false }))
    .then(async (socket) => bindSocketLifecycle(emitter, state, socket, true))
    .catch((error) => emitter.emit('error', error));
  return emitter;
}

export const CloudflareSocket: CloudflareSocketFactory = Object.freeze({
  create: createCloudflareSocket,
});
