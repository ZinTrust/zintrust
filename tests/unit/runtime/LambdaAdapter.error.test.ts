import { afterEach, describe, expect, it, vi } from 'vitest';

const createEvent = () => ({
  httpMethod: 'GET',
  path: '/',
  headers: {},
  queryStringParameters: {},
  body: null,
});

describe('LambdaAdapter error response', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('includes error details in development', async () => {
    process.env.NODE_ENV = 'development';
    vi.resetModules();

    const { LambdaAdapter } = await import('@runtime/adapters/LambdaAdapter');
    const adapter = LambdaAdapter.create({
      handler: async () => {
        throw new Error('boom');
      },
    });

    const response = await adapter.handle(createEvent());
    const body = JSON.parse(String(response.body ?? '')) as { details?: { message?: string } };

    expect(body.details?.message).toBe('boom');
  });

  it('omits error details in production', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const { LambdaAdapter } = await import('@runtime/adapters/LambdaAdapter');
    const adapter = LambdaAdapter.create({
      handler: async () => {
        throw new Error('boom');
      },
    });

    const response = await adapter.handle(createEvent());
    const body = JSON.parse(String(response.body ?? '')) as { details?: unknown };

    expect(body.details).toBeUndefined();
  });

  it('defaults to development when NODE_ENV is empty', async () => {
    process.env.NODE_ENV = '' as any;
    vi.resetModules();

    const { LambdaAdapter } = await import('@runtime/adapters/LambdaAdapter');
    const adapter = LambdaAdapter.create({
      handler: async () => {
        throw new Error('boom');
      },
    });

    const response = await adapter.handle(createEvent());
    const body = JSON.parse(String(response.body ?? '')) as { details?: { message?: string } };

    // Should include details because empty NODE_ENV defaults to development
    expect(body.details?.message).toBe('boom');
  });
});
