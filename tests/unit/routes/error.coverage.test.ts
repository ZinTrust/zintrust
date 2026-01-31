import type { IRequest, IResponse } from '@zintrust/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the errorPages module to test the integration
vi.mock('@/routes/errorPages', () => ({
  serveErrorPagesFile: vi.fn(),
  serveZintrustSvgFile: vi.fn(),
}));

// Mock appConfig
vi.mock('@/config/app', () => ({
  appConfig: {
    isDevelopment: vi.fn().mockReturnValue(true),
  },
}));

import { appConfig } from '@/config/app';
import { ErrorRouting } from '@/routes/error';
import { serveErrorPagesFile, serveZintrustSvgFile } from '@/routes/errorPages';

const mockedAppConfig = vi.mocked(appConfig);

describe('error.ts (patch coverage)', () => {
  let mockRequest: IRequest;
  let mockResponse: IResponse;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      getPath: vi.fn().mockReturnValue('/'),
      getHeader: vi.fn().mockReturnValue('text/html'),
      getMethod: vi.fn().mockReturnValue('GET'),
      getQuery: vi.fn().mockReturnValue({}),
      getHeaders: vi.fn().mockReturnValue({}),
    } as any;

    mockResponse = {
      setStatus: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      html: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleNotFound', () => {
    it('should serve error pages file for /error-pages/ paths', () => {
      const mockGetPath = vi.fn().mockReturnValue('/error-pages/404.html');
      mockRequest.getPath = mockGetPath;

      ErrorRouting.handleNotFound(mockRequest, mockResponse, 'req-123');

      expect(serveErrorPagesFile).toHaveBeenCalledWith('/error-pages/404.html', mockResponse);
    });

    it('should serve ZinTrust SVG file for /zintrust.svg', () => {
      const mockGetPath = vi.fn().mockReturnValue('/zintrust.svg');
      mockRequest.getPath = mockGetPath;

      ErrorRouting.handleNotFound(mockRequest, mockResponse, 'req-123');

      expect(serveZintrustSvgFile).toHaveBeenCalledWith(mockResponse);
    });

    it('should return 404 JSON response for other paths', () => {
      const mockGetPath = vi.fn().mockReturnValue('/unknown-path');
      mockRequest.getPath = mockGetPath;

      // Force JSON preference for this test
      mockRequest.getHeader = vi.fn().mockReturnValue('');

      ErrorRouting.handleNotFound(mockRequest, mockResponse, 'req-123');

      expect(mockResponse.setStatus).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalled();
    });

    it('should handle paths without request ID', () => {
      const mockGetPath = vi.fn().mockReturnValue('/unknown-path');
      mockRequest.getPath = mockGetPath;

      // Force JSON preference for this test
      mockRequest.getHeader = vi.fn().mockReturnValue('');

      ErrorRouting.handleNotFound(mockRequest, mockResponse);

      expect(mockResponse.setStatus).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalled();
    });
  });

  describe('handleInternalServerErrorWithWrappers', () => {
    it('should handle Error instances in development', () => {
      mockedAppConfig.isDevelopment.mockReset();
      mockedAppConfig.isDevelopment.mockReturnValue(true);

      const error = new Error('Test error');
      error.name = 'TestError';

      ErrorRouting.handleInternalServerErrorWithWrappers(
        mockRequest,
        mockResponse,
        error,
        'req-123'
      );

      expect(mockResponse.setStatus).toHaveBeenCalledWith(500);
      expect(mockResponse.html).toHaveBeenCalled();
    });

    it('should handle non-Error instances in development', () => {
      mockedAppConfig.isDevelopment.mockReset();
      mockedAppConfig.isDevelopment.mockReturnValue(true);

      const error = 'String error';

      ErrorRouting.handleInternalServerErrorWithWrappers(
        mockRequest,
        mockResponse,
        error,
        'req-123'
      );

      expect(mockResponse.setStatus).toHaveBeenCalledWith(500);
      expect(mockResponse.html).toHaveBeenCalled();
    });

    it('should handle errors in production', () => {
      mockedAppConfig.isDevelopment.mockReset();
      mockedAppConfig.isDevelopment.mockReturnValue(false);

      const error = new Error('Test error');

      ErrorRouting.handleInternalServerErrorWithWrappers(
        mockRequest,
        mockResponse,
        error,
        'req-123'
      );

      expect(mockResponse.setStatus).toHaveBeenCalledWith(500);
      expect(mockResponse.html).toHaveBeenCalled();
    });

    it('should handle errors without request ID', () => {
      mockedAppConfig.isDevelopment.mockReset();
      mockedAppConfig.isDevelopment.mockReturnValue(true);

      const error = new Error('Test error');

      ErrorRouting.handleInternalServerErrorWithWrappers(mockRequest, mockResponse, error);

      expect(mockResponse.setStatus).toHaveBeenCalledWith(500);
      expect(mockResponse.html).toHaveBeenCalled();
    });
  });
});
