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

  it('preserves opaque token strings in JSON bodies', async () => {
    const mw = SanitizeBodyMiddleware.create();

    const token =
      'cIuztBuvY9I7gMxd9addUNtGJwgxNDGPriYMP1D0fSX3pWE63NXBZozPMkkOPR4AXp+uGvKo23zUUq5fEDdYcLGIqXW9GojKPMizFTfQpFNe0v41JVclMaI/B/STbYUOMvOa+ys4UuNppWePTk/dFbRkHteg4zzLorB+OJyVY35NZGLRcm7MNW+x5ZzzrnG3kc9qfVJfKCzkiqTAU0f2TWJZWdhuBFry5/a6r8JTa3aMShEvoc5D1YszzJBGpxu79WRYygGcrDdr8fmw1qneHlYavHaluFsWwXpuHOVT8SbHgjUULvycAuuXeFZXDGUjlu11b4W6IYf6Vw21CEJSrixpk0zRR7kJcKTB+DsVqbN8CWf2rTRBcFZmSQyi42xy5jIspNz32PhzM8UXu8F7GdtF91WT36XjSIeMfobntf8JVv0JoiNN8rWddyWAPimvRftFymRuIbRppLF6aPANymYaDAsVATIrzsL0/fm4kR73pOq153oj5fW/03MqH4hY9vh2WjZku2u9uThs5BMsnpfmN4xEq78DdehUml1hZ1z5hNetm3J5xzIqyLB/KP5xpPbBVZYI3h8zhoRfqBs4i7mMnClpPJCoi8ufwbZqweA4l5Gq8AyWb3L+MnlpZkv332s3Agu1x2zGpRu1ndcJK3OTBfC/kjnkTM3Ry2KYm98=';

    let body: any = { token };

    const req = {
      getMethod: vi.fn(() => 'POST'),
      isJson: vi.fn(() => true),
      getBody: vi.fn(() => body),
      setBody: vi.fn((nextBody: unknown) => {
        body = nextBody;
      }),
    } as unknown as IRequest;

    const res = {} as IResponse;
    const next = vi.fn().mockResolvedValue(undefined);

    await mw(req, res, next);

    expect(body).toEqual({ token });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
