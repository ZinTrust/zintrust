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
      setRaw: vi.fn(),
      getRaw: vi.fn(),
      setStatus: vi.fn(),
      json: vi.fn(),
    };

    mockNext = vi.fn().mockResolvedValue(undefined);

    // Reset mock implementations
    mockEnv.get.mockImplementation((key: string, defaultValue: string) => {
      if (key === 'ERROR_MODE') return 'html';
      if (key === 'NODE_ENV') return 'development';
      return defaultValue;
    });
  });

  it('handles successful request without errors', async () => {
    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('handles error and serves HTML error page', async () => {
    mockEnv.get.mockReturnValue('html');
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false });

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
    mockEnv.get.mockReturnValue('json');
    mockEnv.get.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'production';
      return 'json';
    });
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false });

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
        requestId: undefined,
        stack: undefined, // No stack in production
      })
    );
  });

  it('includes stack trace in non-production environment', async () => {
    mockEnv.get.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'development';
      return 'json';
    });
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false });

    const error = new Error('Test error');
    error.stack = 'Error stack trace';
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        requestId: undefined,
        stack: 'Error stack trace', // Stack included in development
      })
    );
  });

  it('uses requestId from RequestContext', async () => {
    mockEnv.get.mockReturnValue('json');
    mockEnv.get.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'production';
      return 'json';
    });
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false });
    mockRequestContext.get.mockReturnValue({ requestId: 'test-request-id' });

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
    mockEnv.get.mockReturnValue('json');
    mockEnv.get.mockImplementation((key: string) => {
      if (key === 'ERROR_MODE') return 'json';
      if (key === 'NODE_ENV') return 'production';
      return 'json';
    });
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: false });
    mockRequestContext.get.mockReturnValue(undefined);

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
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({ writableEnded: true });

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
    vi.spyOn(mockRes, 'getRaw').mockReturnValue(null);

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
  });

  it('handles getRaw returning object without writableEnded', async () => {
    vi.spyOn(mockRes, 'getRaw').mockReturnValue({});
    mockEnv.get.mockReturnValue('json');

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalled();
  });

  it('handles getRaw not being a function', async () => {
    vi.spyOn(mockRes, 'getRaw').mockImplementation(() => {
      throw new Error('getRaw is not a function');
    });

    const error = new Error('Test error');
    mockNext = vi.fn().mockRejectedValue(error);

    const middleware = ErrorHandlerMiddleware.create();

    await middleware(mockReq as IRequest, mockRes as IResponse, mockNext);

    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error:', error);
    expect(mockRes.setStatus).toHaveBeenCalledWith(500);
  });
});
