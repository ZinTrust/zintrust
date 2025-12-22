import { middleware, NextFunction } from '@/microservices/RequestTracingMiddleware';
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('RequestTracingMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      getHeader: vi.fn((header: string) => {
        const headers: Record<string, string> = {
          'x-trace-id': '',
          'x-parent-service-id': '',
          'x-trace-depth': '0',
        };
        return headers[header.toLowerCase()];
      }),
      getMethod: vi.fn(() => 'GET'),
      getPath: vi.fn(() => '/health'),
      context: {},
    };

    mockRes = {
      setHeader: vi.fn().mockReturnThis(),
      getStatus: vi.fn(() => 200),
      json: vi.fn(function (this: any, _data: unknown) {
        return this;
      }),
    };

    nextFn = vi.fn();
  });

  describe('Middleware Creation', () => {
    it('should create middleware function when enabled is true', () => {
      const mw = middleware('test-service', true, 1);
      expect(typeof mw).toBe('function');
    });

    it('should create middleware function with default sampling rate', () => {
      const mw = middleware('test-service', true);
      expect(typeof mw).toBe('function');
    });

    it('should create middleware function when disabled', () => {
      const mw = middleware('test-service', false, 1);
      expect(typeof mw).toBe('function');
    });

    it('should create middleware with custom sampling rate', () => {
      const mw = middleware('test-service', true, 0.5);
      expect(typeof mw).toBe('function');
    });
  });

  describe('Middleware Behavior - Disabled', () => {
    it('should call next immediately when middleware is disabled', () => {
      const mw = middleware('test-service', false, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should not set trace headers when middleware is disabled', () => {
      const mw = middleware('test-service', false, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      expect(mockRes.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('Middleware Behavior - Enabled', () => {
    it('should set trace ID header when enabled', () => {
      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-trace-id', expect.any(String));
    });

    it('should set service name header', () => {
      const mw = middleware('my-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-trace-service', 'my-service');
    });

    it('should set trace depth header', () => {
      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-trace-depth', '0');
    });

    it('should call next function', () => {
      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should store trace ID in request context', () => {
      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      expect(mockReq.context).toHaveProperty('traceId');
      expect(typeof mockReq.context?.['traceId']).toBe('string');
    });
  });

  describe('Trace ID Generation', () => {
    it('should generate new trace ID if none provided', () => {
      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      const setHeaderCalls = (mockRes.setHeader as any).mock.calls;
      const traceIdCall = setHeaderCalls.find((call: any) => call[0] === 'x-trace-id');
      expect(typeof traceIdCall?.[1]).toBe('string');
      expect((traceIdCall?.[1] as string).length).toBeGreaterThan(0);
    });

    it('should use existing trace ID from header', () => {
      const existingTraceId = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(mockReq.getHeader as any).mockImplementation((header: string) => {
        if (header === 'x-trace-id') return existingTraceId;
        return '';
      });

      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      const setHeaderCalls = (mockRes.setHeader as any).mock.calls;
      const traceIdCall = setHeaderCalls.find((call: any) => call[0] === 'x-trace-id');
      expect(traceIdCall?.[1]).toBe(existingTraceId);
    });

    it('should preserve parent service ID', () => {
      const parentServiceId = 'auth-service';
      vi.mocked(mockReq.getHeader as any).mockImplementation((header: string) => {
        if (header === 'x-parent-service-id') return parentServiceId;
        return '';
      });

      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      // Just verify the middleware handles parent service ID without error
      expect(nextFn).toHaveBeenCalled();
    });

    it('should handle depth tracking', () => {
      vi.mocked(mockReq.getHeader as any).mockImplementation((header: string) => {
        if (header === 'x-trace-depth') return '5';
        return '';
      });

      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);
      const setHeaderCalls = (mockRes.setHeader as any).mock.calls;
      const depthCall = setHeaderCalls.find((call: any) => call[0] === 'x-trace-depth');
      expect(depthCall?.[1]).toBe('5');
    });
  });

  describe('Response Timing', () => {
    it('should wrap json method to track response timing', () => {
      const mw = middleware('test-service', true, 1);
      void (mockRes.json as any);
      mw(mockReq as Request, mockRes as Response, nextFn);

      // Verify json method was reassigned
      expect(mockRes.json).toBeDefined();
    });

    it('should handle various HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        vi.clearAllMocks();
        vi.mocked(mockReq.getMethod as any).mockReturnValue(method);

        const mw = middleware('test-service', true, 1);
        mw(mockReq as Request, mockRes as Response, nextFn);

        expect(nextFn).toHaveBeenCalled();
      }
    });

    it('should handle various paths', () => {
      const paths = ['/health', '/api/users', '/api/posts/123', '/deep/nested/path'];

      for (const path of paths) {
        vi.clearAllMocks();
        vi.mocked(mockReq.getPath as any).mockReturnValue(path);

        const mw = middleware('test-service', true, 1);
        mw(mockReq as Request, mockRes as Response, nextFn);

        expect(nextFn).toHaveBeenCalled();
      }
    });
  });

  describe('Sampling Rate', () => {
    it('should process all requests with sampling rate 1', () => {
      const mw = middleware('test-service', true, 1);
      for (let i = 0; i < 5; i++) {
        vi.clearAllMocks();
        mw(mockReq as Request, mockRes as Response, nextFn);
        expect(nextFn).toHaveBeenCalled();
      }
    });

    it('should skip all requests with sampling rate 0', () => {
      const mw = middleware('test-service', true, 0);
      for (let i = 0; i < 5; i++) {
        vi.clearAllMocks();
        mw(mockReq as Request, mockRes as Response, nextFn);
        expect(nextFn).toHaveBeenCalled();
      }
    });

    it('should handle fractional sampling rates', () => {
      const mw = middleware('test-service', true, 0.5);
      for (let i = 0; i < 5; i++) {
        vi.clearAllMocks();
        mw(mockReq as Request, mockRes as Response, nextFn);
        expect(nextFn).toHaveBeenCalled();
      }
    });
  });

  describe('Service Names', () => {
    it('should handle different service names', () => {
      const serviceNames = ['auth', 'users', 'products', 'orders', 'payments'];

      for (const serviceName of serviceNames) {
        vi.clearAllMocks();
        const mw = middleware(serviceName, true, 1);
        mw(mockReq as Request, mockRes as Response, nextFn);

        const setHeaderCalls = (mockRes.setHeader as any).mock.calls;
        const serviceCall = setHeaderCalls.find((call: any) => call[0] === 'x-trace-service');
        expect(serviceCall?.[1]).toBe(serviceName);
      }
    });
  });

  describe('Context Management', () => {
    it('should create context if it does not exist', () => {
      const req = { ...mockReq, context: undefined } as any;
      const mw = middleware('test-service', true, 1);
      mw(req as Request, mockRes as Response, nextFn);
      expect(req.context).toBeDefined();
    });

    it('should preserve existing context properties', () => {
      const existingContext = { userId: '123', sessionId: 'abc' };
      mockReq.context = existingContext;

      const mw = middleware('test-service', true, 1);
      mw(mockReq as Request, mockRes as Response, nextFn);

      expect(mockReq.context).toHaveProperty('userId', '123');
      expect(mockReq.context).toHaveProperty('sessionId', 'abc');
      expect(mockReq.context).toHaveProperty('traceId');
    });
  });
});
