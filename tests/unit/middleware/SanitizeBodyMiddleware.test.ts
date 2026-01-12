import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { SanitizeBodyMiddleware } from '@middleware/SanitizeBodyMiddleware';
import { describe, expect, it, vi } from 'vitest';

describe('SanitizeBodyMiddleware', () => {
  it('skips safe methods', async () => {
    const mw = SanitizeBodyMiddleware.create();

    const req = {
      getMethod: vi.fn(() => 'GET'),
      isJson: vi.fn(() => true),
      getBody: vi.fn(() => ({ hello: '<b>world</b>' })),
      setBody: vi.fn(),
    } as unknown as IRequest;

    const res = {} as IResponse;
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(req, res, next);

    expect(req.setBody).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips non-json requests', async () => {
    const mw = SanitizeBodyMiddleware.create();

    const req = {
      getMethod: vi.fn(() => 'POST'),
      isJson: vi.fn(() => false),
      getBody: vi.fn(() => ({ hello: '<b>world</b>' })),
      setBody: vi.fn(),
    } as unknown as IRequest;

    const res = {} as IResponse;
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(req, res, next);

    expect(req.setBody).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sanitizes JSON request bodies', async () => {
    const mw = SanitizeBodyMiddleware.create();

    let body: any = { hello: '<script>alert(1)</script>' };

    const req = {
      getMethod: vi.fn(() => 'POST'),
      isJson: vi.fn(() => true),
      getBody: vi.fn(() => body),
      setBody: vi.fn((b: unknown) => {
        body = b;
      }),
    } as unknown as IRequest;

    const res = {} as IResponse;
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(req, res, next);

    expect(req.setBody).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ hello: 'alert(1)' });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
