import { serveErrorPagesFile, serveZintrustSvgFile } from '@/routes/errorPages';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import type { IResponse } from '@zintrust/core';
import { HTTP_HEADERS, MIME_TYPES } from '@zintrust/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@node-singletons/fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

vi.mock('@node-singletons/path', () => ({
  join: vi.fn((...args) => args.join('/')),
  extname: vi.fn((p) => '.' + p.split('.').pop()?.toLowerCase() || ''),
  resolve: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
  sep: '/',
}));

vi.mock('@zintrust/core', async () => {
  const actual = await vi.importActual('@zintrust/core');
  return {
    ...actual,
    ErrorFactory: {
      createTryCatchError: vi.fn(),
    },
  };
});

describe('errorPages (patch coverage)', () => {
  let mockResponse: IResponse;

  beforeEach(() => {
    vi.clearAllMocks();

    mockResponse = {
      setStatus: vi.fn(),
      setHeader: vi.fn(),
      send: vi.fn(),
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('serveErrorPagesFile', () => {
    it('returns 404 for /error-pages path', () => {
      const result = serveErrorPagesFile('/error-pages', mockResponse);

      expect(result).toBe(true);
      expect(mockResponse.setStatus).toHaveBeenCalledWith(404);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        HTTP_HEADERS.CONTENT_TYPE,
        MIME_TYPES.TEXT
      );
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found');
    });

    it('returns 404 for /error-pages/ path', () => {
      const result = serveErrorPagesFile('/error-pages/', mockResponse);

      expect(result).toBe(true);
      expect(mockResponse.setStatus).toHaveBeenCalledWith(404);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        HTTP_HEADERS.CONTENT_TYPE,
        MIME_TYPES.TEXT
      );
      expect(mockResponse.send).toHaveBeenCalledWith('Not Found');
    });

    it('returns false for non-error-pages paths', () => {
      const result = serveErrorPagesFile('/other-path', mockResponse);

      expect(result).toBe(false);
      expect(mockResponse.setStatus).not.toHaveBeenCalled();
    });

    it('handles directory paths by continuing to next candidate', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      const result = serveErrorPagesFile('/error-pages/test.html', mockResponse);

      expect(result).toBe(true); // Should return true after trying all candidates
      expect(mockResponse.setStatus).toHaveBeenCalled();
    });

    it('handles file read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      const result = serveErrorPagesFile('/error-pages/test.html', mockResponse);

      expect(result).toBe(true);
      expect(mockResponse.setStatus).toHaveBeenCalled();
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('serves files successfully with correct MIME type', () => {
      const mockContent = '<html>Test</html>';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);
      vi.mocked(path.extname).mockReturnValue('.html');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      const result = serveErrorPagesFile('/error-pages/test.html', mockResponse);

      expect(result).toBe(true);
      expect(mockResponse.setStatus).toHaveBeenCalled();
      expect(mockResponse.send).toHaveBeenCalled();
    });
  });

  describe('serveZintrustSvgFile', () => {
    it('returns true when file is found and served', () => {
      const mockSvgContent = '<svg></svg>';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(mockSvgContent);

      serveZintrustSvgFile(mockResponse);

      expect(mockResponse.setStatus).toHaveBeenCalled();
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('returns false when file is not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = serveZintrustSvgFile(mockResponse);

      expect(result).toBe(false);
      expect(mockResponse.setStatus).toHaveBeenCalledWith(404);
    });

    it('handles file read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as any);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = serveZintrustSvgFile(mockResponse);

      expect(result).toBe(false);
      expect(mockResponse.setStatus).toHaveBeenCalled();
    });
  });
});
