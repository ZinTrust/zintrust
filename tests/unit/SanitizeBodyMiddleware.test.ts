import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SanitizeBodyMiddleware', () => {
  it('skips for GET', async () => {
    const { SanitizeBodyMiddleware } = await import('@middleware/SanitizeBodyMiddleware');
    const mw = SanitizeBodyMiddleware.create();

    let nextCalled = false;
    const req: any = { getMethod: () => 'GET' };
    const res: any = {};

    await mw(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('skips when not JSON', async () => {
    const { SanitizeBodyMiddleware } = await import('@middleware/SanitizeBodyMiddleware');
    const mw = SanitizeBodyMiddleware.create();

    let nextCalled = false;
    const req: any = { getMethod: () => 'POST', isJson: () => false };
    const res: any = {};

    await mw(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('sanitizes JSON body and sets body', async () => {
    vi.resetModules();
    vi.doMock('@security/Xss', () => ({
      Xss: { sanitize: (v: any) => ({ cleaned: true, ...v }) },
    }));

    const { SanitizeBodyMiddleware } = await import('@middleware/SanitizeBodyMiddleware');
    const mw = SanitizeBodyMiddleware.create();

    let nextCalled = false;
    const req: any = {
      getMethod: () => 'POST',
      isJson: () => true,
      getBody: () => ({ a: 1 }),
      setBody: (b: any) => {
        req._body = b;
      },
    };
    const res: any = {};

    await mw(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req._body).toEqual({ cleaned: true, a: 1 });
  });
});
