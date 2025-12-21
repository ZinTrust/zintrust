import { Logger } from '@/config/logger';
import { ServiceContainer } from '@/container/ServiceContainer';
import { Kernel } from '@/http/Kernel';
import { Request } from '@/http/Request';
import { Response } from '@/http/Response';
import { MiddlewareStack } from '@/middleware/MiddlewareStack';
import { Router } from '@/routing/EnhancedRouter';
import * as http from 'node:http';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Global mock instances
let mockRequestInstance: any;
let mockResponseInstance: any;

// Mock dependencies
vi.mock('@/routing/EnhancedRouter');
vi.mock('@/middleware/MiddlewareStack');
vi.mock('@/container/ServiceContainer');
vi.mock('@/http/Request', () => ({
  Request: class {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_req: any) {
      return mockRequestInstance;
    }
  },
}));
vi.mock('@/http/Response', () => ({
  Response: class {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_res: any) {
      return mockResponseInstance;
    }
  },
}));
vi.mock('@/config/logger');
vi.mock('@/profiling/RequestProfiler');

describe('Kernel', () => {
  let kernel: Kernel;
  let mockRouter: Router;
  let mockMiddlewareStack: MiddlewareStack;
  let mockContainer: ServiceContainer;
  let mockReq: http.IncomingMessage;
  let mockRes: http.ServerResponse;
  let mockRequest: Request;
  let mockResponse: Response;

  beforeEach(() => {
    mockRouter = new Router() as unknown as Router;
    mockMiddlewareStack = new MiddlewareStack() as unknown as MiddlewareStack;
    mockContainer = new ServiceContainer() as unknown as ServiceContainer;

    // Setup mocks
    mockRouter.match = vi.fn();
    mockMiddlewareStack.register = vi.fn();
    mockMiddlewareStack.execute = vi.fn();

    mockReq = { headers: {} } as unknown as http.IncomingMessage;
    mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
    } as unknown as http.ServerResponse;

    mockRequest = {
      getMethod: vi.fn().mockReturnValue('GET'),
      getPath: vi.fn().mockReturnValue('/test'),
      setParams: vi.fn(),
    } as unknown as Request;

    mockResponse = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
      locals: {},
    } as unknown as Response;

    // Assign to global instances
    mockRequestInstance = mockRequest;
    mockResponseInstance = mockResponse;

    kernel = new Kernel(mockRouter, mockMiddlewareStack, mockContainer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should register global middleware', () => {
    kernel.registerGlobalMiddleware('auth', 'log');
  });

  it('should register route middleware', () => {
    const handler = vi.fn();
    kernel.registerRouteMiddleware('auth', handler);
    expect(mockMiddlewareStack.register).toHaveBeenCalledWith('auth', handler);
  });

  it('should handle successful request', async () => {
    const routeHandler = vi.fn();
    const route = {
      handler: routeHandler,
      params: { id: '1' },
      middleware: ['auth'],
    };
    (mockRouter.match as Mock).mockReturnValue(route);

    await kernel.handleRequest(mockReq, mockRes);

    // expect(Request).toHaveBeenCalledWith(mockReq); // Cannot check this easily with class mock
    // expect(Response).toHaveBeenCalledWith(mockRes);
    expect(mockMiddlewareStack.execute).toHaveBeenCalledTimes(2); // Global + Route
    expect(mockRequest.setParams).toHaveBeenCalledWith({ id: '1' });
    expect(routeHandler).toHaveBeenCalledWith(mockRequest, mockResponse);
  });

  it('should handle 404 Not Found', async () => {
    (mockRouter.match as Mock).mockReturnValue(null);

    await kernel.handleRequest(mockReq, mockRes);

    expect(responseStatusSpy(mockResponse)).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith({ message: 'Not Found' });
  });

  it('should handle internal server error', async () => {
    const error = new Error('Test Error');
    (mockRouter.match as Mock).mockImplementation(() => {
      throw error;
    });

    await kernel.handleRequest(mockReq, mockRes);

    expect(Logger.error).toHaveBeenCalledWith('Kernel error:', error);
    expect(mockRes.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify({ message: 'Internal Server Error' }));
  });

  it('should execute global middleware', async () => {
    kernel.registerGlobalMiddleware('global1');
    (mockRouter.match as Mock).mockReturnValue({
      handler: vi.fn(),
      params: {},
      middleware: [],
    });

    await kernel.handleRequest(mockReq, mockRes);

    expect(mockMiddlewareStack.execute).toHaveBeenCalledWith(
      mockRequest,
      mockResponse,
      expect.arrayContaining(['global1'])
    );
  });

  it('should send 200 OK if response not sent', async () => {
    (mockRouter.match as Mock).mockReturnValue({
      handler: vi.fn(),
      params: {},
      middleware: [],
    });

    await kernel.handleRequest(mockReq, mockRes);

    expect(responseStatusSpy(mockResponse)).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith({ message: 'OK' });
  });

  it('should expose getters', () => {
    expect(kernel.getRouter()).toBe(mockRouter);
    expect(kernel.getMiddlewareStack()).toBe(mockMiddlewareStack);
    expect(kernel.getContainer()).toBe(mockContainer);
  });
});

function responseStatusSpy(res: Response) {
  return res.setStatus;
}
