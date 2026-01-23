import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { ErrorHandlerMiddleware } from '@/middleware/ErrorHandlerMiddleware';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the modules at the top level to avoid conflicts
vi.mock('@/routing/error', () => ({
  default: {
    handleInternalServerErrorWithWrappers: vi.fn(),
  },
}));

vi.mock('@/config/env', () => ({
  Env: {
    get: vi.fn((key: string, defaultValue: string) => {
      if (key === 'ERROR_MODE') return 'html';
      if (key === 'NODE_ENV') return 'development';
      return defaultValue;
    }),
    NODE_ENV: 'development',
  },
}));

vi.mock('@/config/logger', () => ({
  Logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/http/RequestContext', () => ({
  RequestContext: {
    get: vi.fn(),
  },
}));

const mockErrorRouting = vi.mocked(await import('@/routing/error')).default;
const mockEnv = vi.mocked(await import('@/config/env')).Env;
const mockLogger = vi.mocked(await import('@/config/logger')).Logger;
const mockRequestContext = vi.mocked(await import('@/http/RequestContext')).RequestContext;

// Ensure mockEnv.get is a proper Vitest mock
const mockEnvGet = vi.mocked(mockEnv.get);
// Ensure mockRequestContext.get is a proper Vitest mock
const mockRequestContextGet = vi.mocked(mockRequestContext.get);

describe('ErrorHandlerMiddleware Coverage', () => {
  let mockReq: Partial<IRequest>;
  let mockRes: Partial<IResponse>;
  let mockNext: () => Promise<void>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockReq = {
      context: {},
    };

    mockRes = {
      getRaw: vi.fn(),
      setStatus: vi.fn(),
      json: vi.fn(),
    };

    mockNext = vi.fn().mockResolvedValue(undefined);

    // Reset mock implementations
    mockEnvGet.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'ERROR_MODE') return 'html';
      if (key === 'NODE_ENV') return 'development';
      return defaultValue || '';
    });
  });

  it('handles successful request without errors', async () => {
    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('handles error and serves HTML error page', async () => {
    mockEnvGet.mockReturnValue('html');
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false } as any);

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
    expect(mockErrorRouting.handleInternalServerErrorWithWrappers).toHaveBeenCalledWith(
      mockReq,
      mockRes,
      error,
      undefined
    );
  });

  it('handles error and serves JSON error response', async () => {
    mockEnvGet.mockReturnValue('json');
    mockEnvGet.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'production';
      return 'json';
    });
    (mockEnv as typeof mockEnv & { NODE_ENV?: string }).NODE_ENV = 'production';
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false } as any);

    const error = new Error('Test error');
    error.stack = 'Error stack trace';
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        requestId: '',
      })
    );
  });

  it('includes stack trace in non-production environment', async () => {
    mockEnvGet.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'development';
      return 'json';
    });
    (mockEnv as typeof mockEnv & { NODE_ENV?: string }).NODE_ENV = 'development';
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false } as any);

    const error = new Error('Test error');
    error.stack = 'Error stack trace';
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        requestId: '',
        stack: 'Error stack trace', // Stack included in development
      })
    );
  });

  it('uses requestId from RequestContext', async () => {
    mockEnvGet.mockReturnValue('json');
    mockEnvGet.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'production';
      return 'json';
    });
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false } as any);
    mockRequestContextGet.mockReturnValue({
      requestId: 'test-request-id',
      startTime: Date.now(),
      method: 'GET',
      path: '/test',
    });

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        requestId: 'test-request-id',
      })
    );
  });

  it('uses requestId from request context as fallback', async () => {
    mockEnvGet.mockReturnValue('json');
    mockEnvGet.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'production';
      return 'json';
    });
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false } as any);
    mockRequestContextGet.mockReturnValue(undefined);

    mockReq.context = { requestId: 'fallback-request-id' };

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        requestId: 'fallback-request-id',
      })
    );
  });

  it('does nothing when response is already writable ended', async () => {
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: true } as any);

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
    expect(mockErrorRouting.handleInternalServerErrorWithWrappers).not.toHaveBeenCalled();
  });

  it('handles getRaw returning non-object', async () => {
    vi.spyOn(mockRes, 'getRaw').mockReturnValue(null as any);

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
  });

  it('handles getRaw returning object without writableEnded', async () => {
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({} as any);
    mockEnvGet.mockReturnValue('json');

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalled();
  });

  it('handles getRaw not being a function', async () => {
    (mockRes as { getRaw?: unknown }).getRaw = undefined;

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
  });
});
