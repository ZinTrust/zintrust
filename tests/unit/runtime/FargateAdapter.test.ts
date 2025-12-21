import { FargateAdapter } from '@/runtime/adapters/FargateAdapter';
import { AdapterConfig } from '@/runtime/RuntimeAdapter';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:http', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn((_port, _host, cb) => cb()),
    on: vi.fn(),
    close: vi.fn((cb) => cb()),
  })),
}));

describe('FargateAdapter', () => {
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

  const adapter = new FargateAdapter(config);

  it('should identify as fargate platform', () => {
    expect(adapter.platform).toBe('fargate');
  });

  it('should throw error when calling handle()', async () => {
    await expect(adapter.handle()).rejects.toThrow('Fargate adapter requires startServer()');
  });

  it('should start server correctly', async () => {
    await adapter.startServer(8080, '127.0.0.1');
    expect(createServer).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('listening on 127.0.0.1:8080')
    );
  });
});
