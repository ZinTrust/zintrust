import type { IRequest } from '@/http/Request';
import type { IResponse } from '@/http/Response';
import { defaultMiddlewareFailureResponder } from '@/middleware/MiddlewareFailureResponder';
import { describe, expect, it, vi } from 'vitest';

describe('MiddlewareFailureResponder', () => {
  it('falls back to send() when json() is unavailable on the response target', async () => {
    const send = vi.fn();
    const res = {
      setStatus: vi.fn(() => ({ send })),
    } as unknown as IResponse;

    await defaultMiddlewareFailureResponder({} as IRequest, res, {
      middleware: 'error',
      reason: 'unhandled_exception',
      statusCode: 500,
      message: 'Internal server error',
      body: { error: 'Internal server error' },
    });

    expect(send).toHaveBeenCalledWith(JSON.stringify({ error: 'Internal server error' }));
  });
});
