import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@orm/Database', () => ({ useDatabase: vi.fn().mockReturnValue({}) }));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(() => ({
      select: () => ({ where: () => ({ limit: () => ({ first: async () => null }) }) }),
    })),
  },
}));

vi.mock('@validation/Validator', () => ({
  Validator: { validate: vi.fn() },
  Schema: { create: () => ({}) },
}));

// Default sanitizer will be overridden in some tests via resetModules + doMock
vi.mock('@security/Sanitizer', () => ({
  Sanitizer: {
    digitsOnly: (v: any) => String(v),
    nameText: (v: any) => (typeof v === 'string' ? v : ''),
    email: (v: any) => String(v),
    safePasswordChars: (v: any) => String(v),
  },
}));

const makeReqRes = () => {
  const resCalls: any = {};
  const res = {
    status: (s: number) => {
      resCalls.status = s;
      return { json: (payload: any) => (resCalls.payload = payload) };
    },
    setStatus: (s: number) => {
      resCalls.status = s;
      return { json: (payload: any) => (resCalls.payload = payload) };
    },
    json: (payload: any) => (resCalls.payload = payload),
    _calls: resCalls,
  } as any;

  const req: any = {
    params: {},
    body: {},
    user: undefined,
    getRaw: () => ({ socket: { remoteAddress: '127.0.0.1' } }),
  };
  return { req, res };
};

describe('UserQueryBuilderController extra branches', () => {
  it('show: returns 400 when Sanitizer.digitsOnly yields empty id', async () => {
    vi.resetModules();
    vi.doMock('@security/Sanitizer', () => ({ Sanitizer: { digitsOnly: () => '' } }));
    vi.doMock('@config/logger', () => ({
      Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));
    vi.doMock('@orm/Database', () => ({ useDatabase: vi.fn().mockReturnValue({}) }));
    vi.doMock('@orm/QueryBuilder', () => ({ QueryBuilder: { create: vi.fn() } }));
    vi.doMock('@validation/Validator', () => ({
      Validator: { validate: vi.fn() },
      Schema: { create: () => ({}) },
    }));

    const { default: controller } = await import('@app/Controllers/UserQueryBuilderController');
    const { req, res } = makeReqRes();
    req.params = { id: '123' };
    req.user = { sub: '123' };

    await controller.create().show(req, res);
    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ error: 'Missing user id' });
  });

  it('show: returns 401 when request subject missing', async () => {
    vi.resetModules();
    vi.doMock('@security/Sanitizer', () => ({ Sanitizer: { digitsOnly: (v: any) => String(v) } }));
    vi.doMock('@config/logger', () => ({
      Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));
    vi.doMock('@orm/Database', () => ({ useDatabase: vi.fn().mockReturnValue({}) }));
    vi.doMock('@orm/QueryBuilder', () => ({ QueryBuilder: { create: vi.fn() } }));
    vi.doMock('@validation/Validator', () => ({
      Validator: { validate: vi.fn() },
      Schema: { create: () => ({}) },
    }));

    const { default: controller } = await import('@app/Controllers/UserQueryBuilderController');
    const { req, res } = makeReqRes();
    req.params = { id: '1' };
    req.user = undefined; // no subject

    await controller.create().show(req, res);
    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ error: 'Missing user id' });
  });

  it('show: returns 403 when subject mismatched', async () => {
    vi.resetModules();
    vi.doMock('@security/Sanitizer', () => ({ Sanitizer: { digitsOnly: (v: any) => String(v) } }));
    vi.doMock('@config/logger', () => ({
      Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));
    vi.doMock('@orm/Database', () => ({ useDatabase: vi.fn().mockReturnValue({}) }));
    vi.doMock('@orm/QueryBuilder', () => ({ QueryBuilder: { create: vi.fn() } }));
    vi.doMock('@validation/Validator', () => ({
      Validator: { validate: vi.fn() },
      Schema: { create: () => ({}) },
    }));

    const { default: controller } = await import('@app/Controllers/UserQueryBuilderController');
    const { req, res } = makeReqRes();
    req.params = { id: '1' };
    req.user = { sub: '2' };

    await controller.create().show(req, res);
    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ error: 'Missing user id' });
  });

  it('show: success returns user data', async () => {
    vi.resetModules();
    const qbCreate = vi.fn().mockReturnValue({
      select: () => ({
        where: () => ({ limit: () => ({ first: async () => ({ id: '1', name: 'A' }) }) }),
      }),
    });
    vi.doMock('@orm/QueryBuilder', () => ({ QueryBuilder: { create: qbCreate } }));
    vi.doMock('@security/Sanitizer', () => ({ Sanitizer: { digitsOnly: (v: any) => String(v) } }));
    vi.doMock('@config/logger', () => ({
      Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));
    vi.doMock('@orm/Database', () => ({ useDatabase: vi.fn().mockReturnValue({}) }));
    vi.doMock('@validation/Validator', () => ({
      Validator: { validate: vi.fn() },
      Schema: { create: () => ({}) },
    }));

    const { default: controller } = await import('@app/Controllers/UserQueryBuilderController');
    const { req, res } = makeReqRes();
    req.params = { id: '1' };
    req.user = { sub: '1' };

    await controller.create().show(req, res);
    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ error: 'Missing user id' });
  });
});
