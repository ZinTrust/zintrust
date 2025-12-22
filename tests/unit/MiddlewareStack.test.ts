/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import { MiddlewareStack } from '@middleware/MiddlewareStack';
import { beforeEach, describe, expect, it } from 'vitest';

describe('MiddlewareStack Basic Tests', () => {
  let stack: MiddlewareStack;
  let callOrder: string[] = [];

  beforeEach(() => {
    stack = new MiddlewareStack();
    callOrder = [];
  });

  it('should register middleware', () => {
    const handler = async (): Promise<void> => {};
    stack.register('test', handler);

    const middlewares = stack.getMiddlewares();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].name).toBe('test');
  });

  it('should execute middleware in order', async () => {
    stack.register('first', async (_req, _res, next) => {
      callOrder.push('first');
      await next();
    });

    stack.register('second', async (_req, _res, next) => {
      callOrder.push('second');
      await next();
    });

    stack.register('third', async (_req, _res, next) => {
      callOrder.push('third');
      await next();
    });

    // Create mock request/response
    const req = new Request({
      method: 'GET',
      url: '/test',
      headers: {},
    } as any);

    const mockServerResponse = {
      statusCode: 200,
      setHeader: () => {},
      write: () => {},
      end: () => {},
    } as any;

    const res = new Response(mockServerResponse);

    await stack.execute(req, res);

    expect(callOrder).toEqual(['first', 'second', 'third']);
  });
});

describe('MiddlewareStack Early Termination', () => {
  let stack: MiddlewareStack;
  let callOrder: string[] = [];

  beforeEach(() => {
    stack = new MiddlewareStack();
    callOrder = [];
  });

  it('should stop middleware chain early', async () => {
    stack.register('first', async (_req, _res, next) => {
      callOrder.push('first');
      await next();
    });

    stack.register('second', async (_req, _res, _next) => {
      callOrder.push('second');
      // Don't call next()
    });

    stack.register('third', async (_req, _res, next) => {
      callOrder.push('third');
      await next();
    });

    const req = new Request({
      method: 'GET',
      url: '/test',
      headers: {},
    } as any);

    const mockServerResponse = {
      statusCode: 200,
      setHeader: () => {},
      write: () => {},
      end: () => {},
    } as any;

    const res = new Response(mockServerResponse);

    await stack.execute(req, res);

    expect(callOrder).toEqual(['first', 'second']);
  });
});

describe('MiddlewareStack Selective Execution', () => {
  let stack: MiddlewareStack;
  let callOrder: string[] = [];

  beforeEach(() => {
    stack = new MiddlewareStack();
    callOrder = [];
  });

  it('should execute only specified middleware', async () => {
    stack.register('auth', async (_req, _res, next) => {
      callOrder.push('auth');
      await next();
    });

    stack.register('log', async (_req, _res, next) => {
      callOrder.push('log');
      await next();
    });

    stack.register('validate', async (_req, _res, next) => {
      callOrder.push('validate');
      await next();
    });

    const req = new Request({
      method: 'GET',
      url: '/test',
      headers: {},
    } as any);

    const mockServerResponse = {
      statusCode: 200,
      setHeader: () => {},
      write: () => {},
      end: () => {},
    } as any;

    const res = new Response(mockServerResponse);

    await stack.execute(req, res, ['auth', 'validate']);

    expect(callOrder).toEqual(['auth', 'validate']);
  });
});
