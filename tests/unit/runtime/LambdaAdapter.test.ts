import { LambdaAdapter } from '@/runtime/adapters/LambdaAdapter';
import { AdapterConfig } from '@/runtime/RuntimeAdapter';
import { describe, expect, it, vi } from 'vitest';

describe('LambdaAdapter', () => {
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

  const adapter = new LambdaAdapter(config);

  it('should identify as lambda platform', () => {
    expect(adapter.platform).toBe('lambda');
  });

  it('should return a valid logger', () => {
    const logger = adapter.getLogger();
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    logger.info('test');
    expect(mockLogger.info).toHaveBeenCalledWith('test');
  });

  it('should return environment variables', () => {
    const env = adapter.getEnvironment();
    expect(env.runtime).toBe('lambda');
    expect(env.nodeEnv).toBeDefined();
  });

  describe('handle', () => {
    it('should handle API Gateway V1 event', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/test',
        headers: { 'Content-Type': 'application/json' },
        queryStringParameters: { foo: 'bar' },
        body: null,
      };

      const response = await adapter.handle(event);

      expect(mockHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });

    it('should handle API Gateway V2 event', async () => {
      const event = {
        requestContext: {
          http: {
            method: 'POST',
            sourceIp: '127.0.0.1',
          },
        },
        rawPath: '/test',
        headers: { 'content-type': 'application/json' },
        queryStringParameters: {},
        body: '{"test":true}',
        isBase64Encoded: false,
      };

      const response = await adapter.handle(event);

      expect(mockHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });

    it('should handle ALB event', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/alb',
        headers: {},
        requestContext: {
          elb: {
            targetGroupArn: 'arn:aws:elasticloadbalancing:...',
          },
        },
      };

      const response = await adapter.handle(event);

      expect(mockHandler).toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
    });

    it('should handle null body gracefully', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/test',
        headers: {},
        body: null,
      };

      await adapter.handle(event);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle base64 encoded body', async () => {
      const event = {
        httpMethod: 'POST',
        path: '/test',
        headers: {},
        body: Buffer.from('test').toString('base64'),
        isBase64Encoded: true,
      };

      await adapter.handle(event);
      expect(mockHandler).toHaveBeenCalled();
    });
  });
});
