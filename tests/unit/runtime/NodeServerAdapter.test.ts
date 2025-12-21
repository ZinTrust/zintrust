import { NodeServerAdapter } from '@/runtime/adapters/NodeServerAdapter';
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

describe('NodeServerAdapter', () => {
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

  const adapter = new NodeServerAdapter(config);

  it('should identify as nodejs platform', () => {
    expect(adapter.platform).toBe('nodejs');
  });

  it('should throw error when calling handle()', async () => {
    await expect(adapter.handle()).rejects.toThrow('Node.js adapter requires startServer()');
  });

  it('should start server correctly', async () => {
    await adapter.startServer(3000, 'localhost');
    expect(createServer).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('listening on http://localhost:3000')
    );
  });

  it('should stop server correctly', async () => {
    await adapter.startServer(3000, 'localhost');
    await adapter.stop();
    // We can't easily check if server.close was called because we don't have access to the server instance created"
    expect(mockLogger.info).toHaveBeenCalledWith('Node.js server stopped');
  });

  it('should support persistent connections', () => {
    expect(adapter.supportsPersistentConnections()).toBe(true);
  });
});
