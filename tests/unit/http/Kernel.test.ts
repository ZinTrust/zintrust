import { Logger } from '@/config/logger';
import type { IServiceContainer } from '@/container/ServiceContainer';
import { ServiceContainer } from '@/container/ServiceContainer';
import type { IKernel } from '@/http/Kernel';
import { Kernel } from '@/http/Kernel';
import { MiddlewareStack } from '@/middleware/MiddlewareStack';
import { Router } from '@/routes/Router';
import type * as http from '@node-singletons/http';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Env } from '@/config/env';
import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import type { IRouter } from '@/routes/Router';

const otelMock = vi.hoisted(() => ({
  OpenTelemetry: {
    isEnabled: vi.fn(),
    startHttpServerSpan: vi.fn(),
    runWithContext: vi.fn(),
    setHttpRoute: vi.fn(),
    endHttpServerSpan: vi.fn(),
    injectTraceHeaders: vi.fn(),
  },
}));

vi.mock('@/observability/OpenTelemetry', () => otelMock);

vi.mock('@/routing/Router', async () => {
  const actual = await vi.importActual<typeof import('@/routes/Router')>('@/routing/Router');
  return {
    ...actual,
    Router: {
      ...actual.Router,
      match: vi.fn(),
    },
  };
});

// Global mock instances
let mockRequestInstance: any;
let mockResponseInstance: any;

// Mock dependencies
vi.mock('@/middleware/MiddlewareStack', () => ({
  MiddlewareStack: {
    create: vi.fn(),
  },
}));
vi.mock('@/container/ServiceContainer', () => ({
  ServiceContainer: {
    create: vi.fn(),
  },
}));
vi.mock('@/http/Request', () => ({
  Request: {
    create: vi.fn().mockImplementation(() => mockRequestInstance),
  },
}));
vi.mock('@/http/Response', () => ({
  Response: {
    create: vi.fn().mockImplementation(() => mockResponseInstance),
  },
}));
vi.mock('@/config/logger');

describe('Kernel', () => {
  let kernel: IKernel;
  let mockRouter: IRouter;
  let mockMiddlewareStack: any;
  let mockContainer: IServiceContainer;
  let mockReq: http.IncomingMessage;
  let mockRes: http.ServerResponse;
  let mockRequest: IRequest;
  let mockResponse: IResponse;
  let mockResponseHeaders: Record<string, string | string[]>;

  beforeEach(() => {
    mockRouter = { routes: [] } as unknown as IRouter;
    mockMiddlewareStack = { dummy: true };

    (MiddlewareStack.create as unknown as Mock).mockReturnValue(mockMiddlewareStack);
    (ServiceContainer.create as unknown as Mock).mockReturnValue(
      {} as unknown as IServiceContainer
    );

    mockContainer = ServiceContainer.create() as unknown as IServiceContainer;

    // Reset mocks
    vi.clearAllMocks();

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
      getHeader: vi.fn().mockReturnValue(undefined),
      getRaw: vi.fn().mockReturnValue({ socket: { remoteAddress: '127.0.0.1' } }),
      getBody: vi.fn().mockReturnValue({}),
      context: { sessionId: 'test-session' },
    } as unknown as IRequest;

    mockResponseHeaders = {};
    mockResponse = {
      setStatus: vi.fn().mockReturnThis(),
      getStatus: vi.fn().mockReturnValue(200),
      setHeader: vi.fn((name: string, value: string | string[]) => {
        mockResponseHeaders[name] = value;
        return mockResponse;
      }),
      getHeader: vi.fn((name: string) => mockResponseHeaders[name]),
      json: vi.fn(),
      getRaw: vi.fn().mockReturnValue(mockRes),
      locals: {},
    } as unknown as IResponse;

    // Assign to global instances
    mockRequestInstance = mockRequest;
    mockResponseInstance = mockResponse;

    kernel = Kernel.create(mockRouter, mockContainer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should register global middleware', () => {
    const authMiddleware = vi.fn();
    const logMiddleware = vi.fn();
    expect(() => kernel.registerGlobalMiddleware(authMiddleware, logMiddleware)).not.toThrow();
  });

  it('should register route middleware', () => {
    const handler = vi.fn();
    kernel.registerRouteMiddleware('auth', handler);
    expect(() => kernel.registerRouteMiddleware('auth', handler)).not.toThrow();
  });

  it('should handle successful request', async () => {
    const routeHandler = vi.fn();
    const route = {
      handler: routeHandler,
      params: { id: '1' },
      middleware: ['auth'],
    };
    vi.mocked(Router.match).mockReturnValue(route);

    (mockRequest.getHeader as unknown as Mock).mockImplementation((name: string) => {
      if (name.toLowerCase() === 'authorization') return 'Bearer test-token';
      return undefined;
    });

    await kernel.handleRequest(mockRequest, mockResponse);

    expect(routeHandler).toHaveBeenCalledWith(mockRequest, mockResponse);
  });

  it('should create and end an OpenTelemetry span when enabled', async () => {
    process.env['OTEL_ENABLED'] = 'true';
    try {
      const routeHandler = vi.fn();
      const route = {
        handler: routeHandler,
        params: { id: '1' },
        middleware: ['auth'],
        routePath: '/test',
      };
      vi.mocked(Router.match).mockReturnValue(route);

      const span = {
        setAttribute: vi.fn(),
        updateName: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      };

      otelMock.OpenTelemetry.isEnabled.mockReturnValue(true);
      otelMock.OpenTelemetry.startHttpServerSpan.mockReturnValue({
        span,
        context: {} as any,
      });

      otelMock.OpenTelemetry.runWithContext.mockImplementation(async (_ctx: any, fn: any) => fn());

      // RequestContext is created inside kernel; seed fields via req.context (which RequestContext.create reads/writes)
      (mockRequest as any).context.userId = 'user-1';
      (mockRequest as any).context.tenantId = 'tenant-1';
      (mockRequest as any).context.traceId = '4bf92f3577b34da6a3ce929d0e0e4736';

      await kernel.handleRequest(mockRequest, mockResponse);

      expect(otelMock.OpenTelemetry.startHttpServerSpan).toHaveBeenCalled();
      expect(otelMock.OpenTelemetry.startHttpServerSpan).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          serviceName: Env.APP_NAME,
          userId: 'user-1',
          tenantId: 'tenant-1',
        })
      );
      expect(otelMock.OpenTelemetry.setHttpRoute).toHaveBeenCalledWith(span, 'GET', '/test');

      // Late-bound attributes are set in finalize.
      expect(span.setAttribute).toHaveBeenCalledWith('enduser.id', 'user-1');
      expect(span.setAttribute).toHaveBeenCalledWith('zintrust.tenant_id', 'tenant-1');
      expect(span.setAttribute).toHaveBeenCalledWith(
        'zintrust.trace_id',
        '4bf92f3577b34da6a3ce929d0e0e4736'
      );
      expect(otelMock.OpenTelemetry.endHttpServerSpan).toHaveBeenCalled();
    } finally {
      delete process.env['OTEL_ENABLED'];
    }
  });

  it('should not execute route middleware when none configured', async () => {
    const handler = vi.fn();

    vi.mocked(Router.match).mockReturnValue({
      handler,
      params: {},
    });

    await kernel.handleRequest(mockRequest, mockResponse);

    expect(Router.match).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(mockRequest, mockResponse);
  });

  it('should handle 404 Not Found', async () => {
    vi.mocked(Router.match).mockReturnValue(null);

    await kernel.handleRequest(mockRequest, mockResponse);

    expect(responseStatusSpy(mockResponse)).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    );
  });

  it('should handle internal server error', async () => {
    const error = new Error('Test Error');
    vi.mocked(Router.match).mockImplementation(() => {
      throw error;
    });

    await kernel.handleRequest(mockRequest, mockResponse);

    expect(Logger.error).toHaveBeenCalledWith('Kernel error:', error);
    expect(responseStatusSpy(mockResponse)).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
      })
    );
  });

  it('should handle Node request/response via handle()', async () => {
    const routeHandler = vi.fn();
    vi.mocked(Router.match).mockReturnValue({
      handler: routeHandler,
      params: {},
    });

    await kernel.handle(mockReq as any, mockRes as any);

    expect(routeHandler).toHaveBeenCalledWith(mockRequest, mockResponse);
  });

  it('should expose getters', () => {
    expect(kernel.getRouter()).toBe(mockRouter);
    expect(kernel.getMiddlewareStack()).toBe(mockMiddlewareStack);
    expect(kernel.getContainer()).toBe(mockContainer);
  });
});

function responseStatusSpy(res: IResponse) {
  return res.setStatus;
}
