import { DenoAdapter } from '@/runtime/adapters/DenoAdapter';
import { AdapterConfig } from '@/runtime/RuntimeAdapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DenoAdapter', () => {
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

  let adapter: DenoAdapter;

  beforeEach(() => {
    // Mock global Deno object
    (globalThis as any).Deno = {
      env: {
        toObject: vi.fn().mockReturnValue({ DENO_ENV: 'test' }),
        get: vi.fn((key) => (key === 'DENO_ENV' ? 'test' : undefined)),
      },
    };
    adapter = new DenoAdapter(config);
  });

  afterEach(() => {
    delete (globalThis as any).Deno;
    vi.clearAllMocks();
  });

  it('should identify as deno platform', () => {
    expect(adapter.platform).toBe('deno');
  });

  it('should return a valid logger', () => {
    const logger = adapter.getLogger();
    expect(logger).toBeDefined();
  });

  it('should return environment variables safely', () => {
    const env = adapter.getEnvironment();
    expect(env.runtime).toBe('deno');
    expect(env.nodeEnv).toBe('test');
  });

  it('should not support persistent connections', () => {
    expect(adapter.supportsPersistentConnections()).toBe(false);
  });

  describe('handle', () => {
    it('should handle Request object', async () => {
      const request = new Request('http://localhost/test', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await adapter.handle(request);

      expect(response.statusCode).toBe(200);
    });

    it('should handle POST request with body', async () => {
      const request = new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });

      const response = await adapter.handle(request);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('formatResponse', () => {
    it('should format PlatformResponse to Response', () => {
      const platformResponse = {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: '{"created":true}',
      };

      const response = adapter.formatResponse(platformResponse);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(201);
      expect(response.headers.get('content-type')).toBe('application/json');
    });
  });
});
