import { IApplication } from '@boot/Application';
import { Server } from '@boot/Server';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const createServerMock = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('@/Application');
vi.mock('@/http/Request');
vi.mock('@/http/Response');
vi.mock('@/config/logger');
vi.mock('@node-singletons/http', () => ({ createServer: createServerMock }));
vi.mock('@node-singletons/fs');

describe('Server', () => {
  beforeEach(() => {
    createServerMock.mockReset();
  });
  const mockApp = {
    getRouter: vi.fn().mockReturnValue({
      match: vi.fn(),
    }),
    getContainer: vi.fn().mockReturnValue({}),
  } as unknown as IApplication;

  it('should create http server', () => {
    (createServerMock as Mock).mockReturnValue({ on: vi.fn() });
    const server = Server.create(mockApp);
    expect(createServerMock).toHaveBeenCalled();
    expect(server.getHttpServer()).toBeDefined();
  });

  it('should listen on port', async () => {
    const mockHttpServer = {
      listen: vi.fn((_port, _host, cb) => cb()),
      close: vi.fn(),
      on: vi.fn(),
    };

    (createServerMock as Mock).mockReturnValue(mockHttpServer);

    const server = Server.create(mockApp, 3000, 'localhost');
    await server.listen();

    expect(mockHttpServer.listen).toHaveBeenCalledWith(3000, 'localhost', expect.any(Function));
  });

  it('should close server', async () => {
    let onConnection: ((socket: any) => void) | undefined;

    const mockHttpServer = {
      listen: vi.fn(),
      close: vi.fn((cb) => cb()),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (event === 'connection') onConnection = handler as any;
      }),
    };
    (createServerMock as Mock).mockReturnValue(mockHttpServer);

    const server = Server.create(mockApp);

    const closeHandlers: Record<string, (() => void) | undefined> = {};
    const mockSocket = {
      on: vi.fn((event: string, handler: () => void) => {
        closeHandlers[event] = handler;
      }),
      destroy: vi.fn(),
    };

    // Simulate a keep-alive connection so the server tracks sockets
    expect(onConnection).toBeDefined();
    onConnection?.(mockSocket);
    expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));

    await server.close();

    expect(mockHttpServer.close).toHaveBeenCalled();
    expect(mockSocket.destroy).toHaveBeenCalled();

    // Simulate socket close event to exercise cleanup handler (best-effort)
    closeHandlers['close']?.();
  });

  it('should handle request', async () => {
    const mockReq = {} as any;
    const mockRes = {
      setHeader: vi.fn(),
      writeHead: vi.fn(),
      end: vi.fn(),
    } as any;

    // Get the request handler passed to createServer
    let requestHandler: ((req: any, res: any) => void) | undefined;
    (createServerMock as Mock).mockImplementation((handler) => {
      requestHandler = handler;
      return { listen: vi.fn(), on: vi.fn() };
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
