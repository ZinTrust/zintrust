import { Request } from '@/http/Request';
import { Response } from '@/http/Response';
import { Middleware, MiddlewareStack } from '@/middleware/MiddlewareStack';
import { beforeEach, describe, expect, it } from 'vitest';

describe('MiddlewareStack', () => {
  let stack: MiddlewareStack;
  let mockReq: Request;
  let mockRes: Response;

  beforeEach(() => {
    stack = new MiddlewareStack();
    mockReq = {} as Request;
    mockRes = {} as Response;
  });

  it('should register middleware', () => {
    const handler: Middleware = async (_req, _res, next) => await next();
    stack.register('test', handler);
    expect(stack.getMiddlewares()).toHaveLength(1);
    expect(stack.getMiddlewares()[0]).toEqual({ name: 'test', handler });
  });

  it('should execute middleware in order', async () => {
    const order: string[] = [];
    const m1: Middleware = async (_req, _res, next) => {
      order.push('m1-start');
      await next();
      order.push('m1-end');
    };
    const m2: Middleware = async (_req, _res, next) => {
      order.push('m2-start');
      await next();
      order.push('m2-end');
    };

    stack.register('m1', m1);
    stack.register('m2', m2);

    await stack.execute(mockReq, mockRes);

    expect(order).toEqual(['m1-start', 'm2-start', 'm2-end', 'm1-end']);
  });

  it('should execute only specified middleware', async () => {
    const executed: string[] = [];
    const m1: Middleware = async (_req, _res, next) => {
      executed.push('m1');
      await next();
    };
    const m2: Middleware = async (_req, _res, next) => {
      executed.push('m2');
      await next();
    };

    stack.register('m1', m1);
    stack.register('m2', m2);

    await stack.execute(mockReq, mockRes, ['m2']);

    expect(executed).toEqual(['m2']);
  });

  it('should handle empty stack', async () => {
    await expect(stack.execute(mockReq, mockRes)).resolves.toBeUndefined();
  });

  it('should stop execution if next is not called', async () => {
    const executed: string[] = [];
    const m1: Middleware = async (_req, _res, _next) => {
      executed.push('m1');
      // next() is not called
    };
    const m2: Middleware = async (_req, _res, next) => {
      executed.push('m2');
      await next();
    };

    stack.register('m1', m1);
    stack.register('m2', m2);

    await stack.execute(mockReq, mockRes);

    expect(executed).toEqual(['m1']);
  });
});
