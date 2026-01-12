import { type Mock, describe, expect, it, vi } from 'vitest';

import * as http from '@node-singletons/http';

vi.mock('@node-singletons/http');
vi.mock('@node-singletons/fs', () => {
  return {
    existsSync: vi.fn(() => false),
    statSync: vi.fn(() => ({ isDirectory: () => false })),
    readFileSync: vi.fn(() => Buffer.from('')),
  };
});

let observedBody: unknown;

vi.mock('@routing/Router', () => {
  return {
    Router: {
      match: vi.fn(() => {
        return {
          params: {},
          handler: async () => {
            // Server should not call route handlers directly anymore.
            // If this runs, the test should fail implicitly (observedBody stays undefined).
          },
        };
      }),
    },
  };
});

describe('Server body parsing', () => {
  it('parses application/json and calls req.setBody(parsed)', async () => {
    observedBody = undefined;

    const { Server } = await import('@boot/Server');

    let requestHandler:
      | ((req: http.IncomingMessage, res: http.ServerResponse) => unknown)
      | undefined;
    (http.createServer as Mock).mockImplementation((handler: any) => {
      requestHandler = handler;
      return { listen: vi.fn(), on: vi.fn() } as any;
    });

    const rawReq = {
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'content-type': 'application/json',
      },
      destroy: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ email: 'a@b.com', password: 'pw' }));
      },
    } as any as http.IncomingMessage;

    const rawRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      writeHead: vi.fn(),
      end: vi.fn(),
    } as any as http.ServerResponse;

    const mockApp = {
      getRouter: vi.fn(() => ({})),
      getContainer: vi.fn(() => ({})),
    } as any;

    const kernelStub = {
      handleRequest: async (req: any, res: any): Promise<void> => {
        observedBody = req.getBody();
        res.setStatus(200).json({ ok: true });
      },
    } as any;

    Server.create(mockApp, undefined, undefined, kernelStub);

    expect(requestHandler).toBeDefined();
    await requestHandler?.(rawReq, rawRes);

    expect(observedBody).toEqual({ email: 'a@b.com', password: 'pw' });
  });
});
