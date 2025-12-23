import { middleware, NextFunction } from '@/microservices/RequestTracingMiddleware';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('RequestTracingMiddleware', () => {
  let mockReq: any;
  let mockRes: any;
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
      json: vi.fn().mockReturnThis(),
    };

    nextFn = vi.fn();
  });

  describe('Middleware Creation', () => {
    it('should create middleware function', () => {
      const mw = middleware('test-service');
      expect(typeof mw).toBe('function');
    });
  });

  describe('Trace ID Generation', () => {
    it('should generate new trace ID if not present in headers', async () => {
      const mw = middleware('test-service');
      await mw(mockReq, mockRes, nextFn);

      expect(mockReq.context.trace.traceId).toBeDefined();
      expect(mockReq.context.trace.traceId.length).toBeGreaterThan(0);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-trace-id', mockReq.context.trace.traceId);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should use existing trace ID from headers', async () => {
      const existingTraceId = 'existing-trace-id';
      mockReq.getHeader = vi.fn((header: string) => {
        if (header.toLowerCase() === 'x-trace-id') return existingTraceId;
        return '';
      });

      const mw = middleware('test-service');
      await mw(mockReq, mockRes, nextFn);

      expect(mockReq.context.trace.traceId).toBe(existingTraceId);
      expect(mockRes.setHeader).toHaveBeenCalledWith('x-trace-id', existingTraceId);
    });
  });

  describe('Trace Context', () => {
    it('should set parent service ID from headers', async () => {
      const parentId = 'parent-service';
      mockReq.getHeader = vi.fn((header: string) => {
        if (header.toLowerCase() === 'x-parent-service-id') return parentId;
        return '';
      });

      const mw = middleware('test-service');
      await mw(mockReq, mockRes, nextFn);

      expect(mockReq.context.trace.parentServiceId).toBe(parentId);
    });

    it('should increment trace depth', async () => {
      mockReq.getHeader = vi.fn((header: string) => {
        if (header.toLowerCase() === 'x-trace-depth') return '2';
        return '';
      });

      const mw = middleware('test-service');
      await mw(mockReq, mockRes, nextFn);

      expect(mockReq.context.trace.depth).toBe(2);
    });
  });
});
