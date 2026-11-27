/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: any[]) => void;

const H = vi.hoisted(() => ({
  env: {
    SMTP_PROXY_URL: '',
    SMTP_PROXY_HOST: '',
    SMTP_PROXY_PORT: 8791,
    SMTP_PROXY_KEY_ID: 'kid',
    SMTP_PROXY_SECRET: 'secret',
    SMTP_PROXY_TIMEOUT_MS: 1000,
    USE_SMTP_PROXY: false,
  } as Record<string, any>,
  isWorkers: false,
  socketsEnabled: true,
  customHeaders: undefined as any,
  normalizedCreds: { keyId: 'kid', secret: 'secret' } as any,
  proxyResponse: { ok: true, messageId: 'message-1' } as any,
  signedHeaders: { 'x-signature': 'sig' } as any,
  signedUrl: undefined as any,
  socketFactory: undefined as any,
  netConnect: vi.fn(),
  tlsConnect: vi.fn(),
  proxyRequest: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@config/env', () => ({
  Env: new Proxy({}, {
    get: (_target, key: string | symbol) => H.env[key as string],
  }),
}));

vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getWorkersEnv: () => (H.isWorkers ? {} : null),
    isCloudflareSocketsEnabled: () => H.socketsEnabled,
  },
}));

vi.mock('@config/logger', () => ({ Logger: H.logger }));

vi.mock('@orm/adapters/SqlProxyAdapterUtils', () => ({
  parseCustomHeadersFromEnv: () => H.customHeaders,
}));

vi.mock('@proxy/SigningService', () => ({
  normalizeSigningCredentials: (creds: any) =>
    H.normalizedCreds === undefined ? creds : H.normalizedCreds,
}));

vi.mock('@common/RemoteSignedJson', () => ({
  RemoteSignedJson: {
    request: vi.fn(async (_settings: any, _path: string, _body: any) => {
      H.proxyRequest(_settings, _path, _body);
      return H.proxyResponse;
    }),
  },
}));

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    createHeaders: vi.fn(async ({ url }: { url: URL }) => {
      H.signedUrl = url;
      return H.signedHeaders;
    }),
  },
}));

vi.mock('@sockets/CloudflareSocket', () => ({
  get CloudflareSocket() {
    return H.socketFactory;
  },
}));

vi.mock('@node-singletons/net', () => ({
  connect: (...args: any[]) => H.netConnect(...args),
}));

vi.mock('@node-singletons/tls', () => ({
  connect: (...args: any[]) => H.tlsConnect(...args),
}));

import { SmtpDriver } from '@/tools/mail/drivers/Smtp';

const message = (overrides: Record<string, unknown> = {}) => ({
  to: 'to@example.com',
  from: { email: 'from@example.com' },
  subject: 'subject',
  text: 'body',
  ...overrides,
});

const happyResponses = [
  '220 welcome',
  '250 OK',
  '250 OK',
  '250 OK',
  '354 Continue',
  '250 Queued',
  '221 Bye',
];

type SocketOptions = {
  stringData?: boolean;
  noSetTimeout?: boolean;
  noOff?: boolean;
  noRemoveListener?: boolean;
  writeArity?: 1 | 2;
  writeError?: Error;
  doubleCallback?: boolean;
  noConnect?: boolean;
};

const createSocket = (lines: string[], options: SocketOptions = {}) => {
  const listeners: Record<string, Listener[]> = {};
  let index = 0;
  let scheduled = false;

  const emitData = (line: string): void => {
    const payload = options.stringData ? `${line}\r\n` : Buffer.from(`${line}\r\n`);
    for (const handler of listeners['data'] ?? []) handler(payload);
  };

  const scheduleEmit = (): void => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      while (index < lines.length) emitData(lines[index++]);
    }, 0);
  };

  const socket: any = {
    __listeners: listeners,
    ...(options.noSetTimeout ? {} : { setTimeout: vi.fn(() => socket) }),
    end: vi.fn(),
    destroy: vi.fn(),
    on: (event: string, handler: Listener) => {
      (listeners[event] ??= []).push(handler);
      if (event === 'data') scheduleEmit();
      return socket;
    },
    once: (event: string, handler: Listener) => {
      if (event === 'connect' || event === 'secureConnect') {
        if (!options.noConnect) handler();
        if (index < lines.length) setTimeout(() => emitData(lines[index++]), 0);
        scheduleEmit();
      } else {
        (listeners[event] ??= []).push(handler);
      }
      return socket;
    },
    off:
      options.noOff === true
        ? undefined
        : (event: string, handler: Listener) => {
            listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== handler);
            return socket;
          },
    removeListener: options.noRemoveListener
      ? undefined
      : (event: string, handler: Listener) => {
          listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== handler);
          return socket;
        },
  };

  if (options.writeArity === 1) {
    socket.write = (_data: string, cb?: (err?: Error | null) => void) => {
      cb?.(options.writeError ?? null);
      if (options.doubleCallback) cb?.(null);
      if (index < lines.length) emitData(lines[index++]);
    };
  } else {
    socket.write = (
      _data: string,
      cb?: (err?: Error | null) => void
    ) => {
      cb?.(options.writeError ?? null);
      if (options.doubleCallback) cb?.(null);
      if (index < lines.length) emitData(lines[index++]);
    };
  }

  return socket;
};

describe('SmtpDriver uncovered branches', () => {
  beforeEach(() => {
    H.env = {
      SMTP_PROXY_URL: '',
      SMTP_PROXY_HOST: '',
      SMTP_PROXY_PORT: 8791,
      SMTP_PROXY_KEY_ID: 'kid',
      SMTP_PROXY_SECRET: 'secret',
      SMTP_PROXY_TIMEOUT_MS: 1000,
      USE_SMTP_PROXY: false,
    };
    H.isWorkers = false;
    H.socketsEnabled = true;
    H.customHeaders = undefined;
    H.normalizedCreds = undefined;
    H.proxyResponse = { ok: true, messageId: 'message-1' };
    H.signedHeaders = { 'x-signature': 'sig' };
    H.signedUrl = undefined;
    H.socketFactory = undefined;
    H.netConnect.mockReset();
    H.tlsConnect.mockReset();
    H.proxyRequest.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses the proxy with signed settings, trailing prefixes and serialized attachments', async () => {
    H.env['USE_SMTP_PROXY'] = true;
    H.env['SMTP_PROXY_URL'] = 'http://proxy.local/base/';
    H.env['SMTP_PROXY_HEADERS_X_Test'] = 'header';

    const result = await SmtpDriver.send(
      { host: 'smtp.example.com', port: 587 },
      message({
        html: '<p>hi</p>',
        attachments: [
          { filename: 'buffer.txt', content: Buffer.from('buffer') },
          { filename: 'string.txt', content: 'string' },
        ],
      })
    );
    expect(result).toEqual({ ok: true, provider: 'smtp', messageId: 'message-1' });
    expect(H.proxyRequest.mock.calls[0]?.[0]).toMatchObject({
      baseUrl: 'http://proxy.local/base/',
      keyId: 'kid',
      secret: 'secret',
      signaturePathPrefixToStrip: '/base',
    });
    expect(H.proxyRequest.mock.calls[0]?.[2].message.attachments).toEqual([
      { filename: 'buffer.txt', contentBase64: Buffer.from('buffer').toString('base64') },
      { filename: 'string.txt', contentBase64: Buffer.from('string').toString('base64') },
    ]);

    H.env['SMTP_PROXY_URL'] = 'http://proxy.local/base';
    await SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    expect(H.proxyRequest.mock.calls[1]?.[0].signaturePathPrefixToStrip).toBe('/base');

    H.env['SMTP_PROXY_URL'] = 'http://proxy.local/';
    await SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    expect(H.proxyRequest.mock.calls[2]?.[0].signaturePathPrefixToStrip).toBeUndefined();

    H.env['SMTP_PROXY_URL'] = 'http://proxy.local//';
    await SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    expect(H.proxyRequest.mock.calls[3]?.[0].signaturePathPrefixToStrip).toBeUndefined();
  });

  it('falls back proxy url to host/port and validates signing credentials', async () => {
    H.env['USE_SMTP_PROXY'] = true;
    H.env['SMTP_PROXY_URL'] = '';
    H.env['SMTP_PROXY_HOST'] = 'proxy.local';
    H.env['SMTP_PROXY_PORT'] = 8899;

    await SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    expect(H.proxyRequest.mock.calls[0]?.[0].baseUrl).toBe('http://proxy.local:8899');

    H.env['SMTP_PROXY_HOST'] = '';
    await SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    expect(H.proxyRequest.mock.calls[1]?.[0].baseUrl).toBe('http://127.0.0.1:8899');

    delete H.env['SMTP_PROXY_KEY_ID'];
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/signing credentials are missing/);

    delete H.env['SMTP_PROXY_SECRET'];
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/signing credentials are missing/);

    H.env['SMTP_PROXY_KEY_ID'] = '';
    H.env['SMTP_PROXY_SECRET'] = 'secret';
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/signing credentials are missing/);

    H.customHeaders = { 'x-custom': 'value' };
    H.env['SMTP_PROXY_KEY_ID'] = 'kid';
    await SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    expect(H.signedHeaders['x-custom']).toBeUndefined();
  });

  it('covers direct socket guards, short lines, dot stuffing and write callbacks', async () => {
    H.netConnect.mockReturnValueOnce(createSocket(happyResponses, { noSetTimeout: true }));
    await expect(
      SmtpDriver.send(
        { host: 'smtp.example.com', port: 587 },
        message({ text: 'hello\n.dot-leading' })
      )
    ).resolves.toMatchObject({ ok: true });

    H.netConnect.mockReturnValueOnce(createSocket(happyResponses, { stringData: true, noOff: true }));
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).resolves.toMatchObject({ ok: true });

    H.netConnect.mockReturnValueOnce(
      createSocket(['220', '250-', '250 ', '250 OK', '250 OK', '354 Continue', '250 Queued', '221 Bye'])
    );
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).resolves.toMatchObject({ ok: true });

    H.netConnect.mockReturnValueOnce(
      createSocket(happyResponses, { writeArity: 1, writeError: new Error('write failed'), doubleCallback: true })
    );
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/SMTP send failed/);
  });

  it('rejects when a direct socket read times out', async () => {
    vi.useFakeTimers();
    H.netConnect.mockReturnValueOnce(createSocket([]));

    const pending = SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    const asserted = expect(pending).rejects.toThrow(/SMTP send failed/);
    await vi.advanceTimersByTimeAsync(30000);
    await asserted;
  });

  it('covers workers socket factory validation, cleanup listeners and socket-disabled proxy mode', async () => {
    H.isWorkers = true;

    H.socketFactory = {};
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/SMTP socket initialization failed/);

    H.socketFactory = { create: () => undefined };
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/SMTP socket initialization failed/);

    const errorSocket = createSocket([], { noConnect: true });
    setTimeout(() => {
      for (const handler of (errorSocket as any).__listeners?.['error'] ?? []) {
        handler(new Error('workers connect failed'));
      }
    }, 0);
    H.socketFactory = { create: () => errorSocket };
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/SMTP connection failed/);

    H.env['USE_SMTP_PROXY'] = true;
    H.socketsEnabled = false;
    H.env['SMTP_PROXY_URL'] = 'http://proxy.local/base';
    await SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message());
    expect(H.proxyRequest).toHaveBeenCalled();

    H.env['USE_SMTP_PROXY'] = false;
    H.env['SMTP_PROXY_URL'] = '';
    H.socketFactory = {};
    await expect(
      SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
    ).rejects.toThrow(/SMTP socket initialization failed/);
  });

  it('covers workers socket success and cleanup listener variants', async () => {
    H.isWorkers = true;

    for (const variant of ['off', 'removeListener', 'none'] as const) {
      H.socketFactory = {
        create: () => {
          const socket = createSocket(happyResponses, {
            noOff: variant !== 'off',
            noRemoveListener: variant === 'none',
          });
          return socket;
        },
      };
      await expect(
        SmtpDriver.send({ host: 'smtp.example.com', port: 587 }, message())
      ).resolves.toMatchObject({ ok: true });
    }
  });
});
