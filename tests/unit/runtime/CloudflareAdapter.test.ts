import { CloudflareAdapter } from '@/runtime/adapters/CloudflareAdapter';
import { AdapterConfig } from '@/runtime/RuntimeAdapter';
import { describe, expect, it, vi } from 'vitest';

describe('CloudflareAdapter', () => {
  const mockHandler = vi.fn().mockResolvedValue(undefined);
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const config: AdapterConfig = {
    handler: mockHandler,
    logger: mockLogger,
  };

  const adapter = new CloudflareAdapter(config);

  it('should identify as cloudflare platform', () => {
    expect(adapter.platform).toBe('cloudflare');
  });

  describe('handle', () => {
    it('should handle Cloudflare Request object', async () => {
      const request = new Request('http://localhost/test', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      });

      const response = await adapter.handle(request);

      expect(response.statusCode).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle POST request with body', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      const response = await adapter.handle(request);

      expect(response.statusCode).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const errorConfig: AdapterConfig = {
        handler: vi.fn().mockRejectedValue(new Error('Test error')),
        logger: mockLogger,
      };
      const errorAdapter = new CloudflareAdapter(errorConfig);

      const request = new Request('http://localhost/test', {
        method: 'GET',
      });

      const response = await errorAdapter.handle(request);

      expect(response.statusCode).toBe(500);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('parseRequest', () => {
    it('should parse Cloudflare request correctly', () => {
      const request = new Request('http://localhost/path?query=1', {
        method: 'GET',
        headers: { 'X-Custom': 'value', 'cf-connecting-ip': '10.0.0.1' },
      });

      // Since parseRequest is public in the class definition I saw:
      const parsed = adapter.parseRequest(request as any);

      expect(parsed.method).toBe('GET');
      expect(parsed.path).toBe('/path');
      expect(parsed.query).toEqual({ query: '1' });
      expect(parsed.remoteAddr).toBe('10.0.0.1');
    });
  });
});
