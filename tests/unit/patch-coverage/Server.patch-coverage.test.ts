import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/app', () => {
  return { appConfig: { port: 3000, host: '127.0.0.1' } };
});

vi.mock('@config/constants', () => {
  return {
    HTTP_HEADERS: {
      X_POWERED_BY: 'x-powered-by',
      X_CONTENT_TYPE_OPTIONS: 'x-content-type-options',
      X_FRAME_OPTIONS: 'x-frame-options',
      X_XSS_PROTECTION: 'x-xss-protection',
      REFERRER_POLICY: 'referrer-policy',
      CONTENT_SECURITY_POLICY: 'content-security-policy',
    },
  };
});

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

vi.mock('@container/ServiceContainer', () => ({
  ServiceContainer: { create: vi.fn(() => ({ singleton: vi.fn() })) },
}));

// Kernel and Request/Response mocks
const kernelMock = { handleRequest: vi.fn(async () => {}) };
vi.mock('@http/Kernel', () => ({ Kernel: { create: vi.fn(() => kernelMock) } }));
vi.mock('@http/Request', () => ({ Request: { create: vi.fn((r) => ({ raw: r })) } }));
vi.mock('@http/Response', () => ({ Response: { create: vi.fn((r) => ({ raw: r })) } }));

// ErrorRouting - mocked directly (avoid referencing hoisted variables)
vi.mock('@routing/error', () => ({
  ErrorRouting: {
    handleInternalServerErrorWithWrappers: vi.fn(),
    handleInternalServerErrorRaw: vi.fn(),
  },
}));

// Mock http server factory to capture handler
let savedHandler: any = null;
const fakeServer = {
  listen: vi.fn((_port, _host, cb) => cb && cb()),
  close: vi.fn((cb) => cb && cb()),
  on: vi.fn((_ev, _cb) => {}),
};
vi.mock('@node-singletons/http', () => ({
  createServer: (handler: any) => {
    savedHandler = handler;
    return fakeServer;
  },
  Server: {},
}));

import { Server } from '@/boot/Server';

beforeEach(() => {
  vi.clearAllMocks();
  savedHandler = null;
});

describe('patch coverage: Server', () => {
  it('sets security headers and calls raw error handler when req is null', async () => {
    const app = { getRouter: () => ({}), getContainer: () => ({}) } as any;
    const server = Server.create(app, 0, '127.0.0.1', null);
    server.getHttpServer();

    // create fake response with header recording
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    } as any;

    // call captured handler with null req
    await savedHandler(null, res);

    expect(headers['x-powered-by']).toBe('ZinTrust');
    const mod = await import('@routing/error');
    expect(mod.ErrorRouting.handleInternalServerErrorRaw).toHaveBeenCalled();
  });

  it('delegates to Kernel.handleRequest on normal requests', async () => {
    const app = { getRouter: () => ({}), getContainer: () => ({}) } as any;
    Server.create(app, 0, '127.0.0.1', null);

    const req = { method: 'GET', url: '/' } as any;
    const res = { setHeader: vi.fn() } as any;

    await savedHandler(req, res);

    expect(kernelMock.handleRequest).toHaveBeenCalled();
  });
});
