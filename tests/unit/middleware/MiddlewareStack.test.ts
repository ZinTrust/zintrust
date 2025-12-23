import { IMiddlewareStack, MiddlewareStack } from '@middleware/MiddlewareStack';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MiddlewareStack', () => {
  let stack: IMiddlewareStack;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    stack = MiddlewareStack.create();
    mockReq = {} as any;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    } as any;
  });

  it('should register middleware', () => {
    const handler = async () => {};
    stack.register('test', handler);
    expect(stack.getMiddlewares()).toHaveLength(1);
    expect(stack.getMiddlewares()[0].name).toBe('test');
  });

  it('should execute middleware in order', async () => {
    const order: string[] = [];
    stack.register('first', async (_req, _res, next) => {
      order.push('first');
      await next();
    });
    stack.register('second', async (_req, _res, next) => {
      order.push('second');
      await next();
    });

    await stack.execute(mockReq, mockRes);
    expect(order).toEqual(['first', 'second']);
  });

  it('should stop execution if next is not called', async () => {
    const order: string[] = [];
    stack.register('first', async (_req, _res, _next) => {
      order.push('first');
      // next() not called
    });
    stack.register('second', async (_req, _res, next) => {
      order.push('second');
      await next();
    });

    await stack.execute(mockReq, mockRes);
    expect(order).toEqual(['first']);
  });
});
