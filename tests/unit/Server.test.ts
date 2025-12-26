import { IApplication } from '@boot/Application';
import { Server } from '@boot/Server';
import * as http from '@node-singletons/http';
import { type Mock, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/Application');
vi.mock('@/http/Request');
vi.mock('@/http/Response');
vi.mock('@/config/logger');
vi.mock('node:http');
vi.mock('node:fs');

describe('Server', () => {
  const mockApp = {
    getRouter: vi.fn().mockReturnValue({
      match: vi.fn(),
    }),
  } as unknown as IApplication;

  it('should create http server', () => {
    (http.createServer as Mock).mockReturnValue({});
    const server = Server.create(mockApp);
    expect(http.createServer).toHaveBeenCalled();
    expect(server.getHttpServer()).toBeDefined();
  });

  it('should listen on port', async () => {
    const mockHttpServer = {
      listen: vi.fn((_port, _host, cb) => cb()),
      close: vi.fn(),
    };
    (http.createServer as Mock).mockReturnValue(mockHttpServer);

    const server = Server.create(mockApp, 3000, 'localhost');
    await server.listen();

    expect(mockHttpServer.listen).toHaveBeenCalledWith(3000, 'localhost', expect.any(Function));
  });

  it('should close server', async () => {
    const mockHttpServer = {
      listen: vi.fn(),
      close: vi.fn((cb) => cb()),
    };
    (http.createServer as Mock).mockReturnValue(mockHttpServer);

    const server = Server.create(mockApp);
    await server.close();

    expect(mockHttpServer.close).toHaveBeenCalled();
  });

  it('should handle request', async () => {
    const mockReq = {} as http.IncomingMessage;
    const mockRes = {
      setHeader: vi.fn(),
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    // Get the request handler passed to createServer
    let requestHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | undefined;
    (http.createServer as Mock).mockImplementation((handler) => {
      requestHandler = handler;
      return { listen: vi.fn() };
    });

    const server = Server.create(mockApp);
    expect(server.getHttpServer()).toBeDefined();

    // Simulate request
    if (requestHandler) {
      requestHandler(mockReq, mockRes);
    }

    // Verify security headers
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Powered-By', 'ZinTrust');
  });
});
