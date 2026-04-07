import { describe, expect, it, vi } from 'vitest';

const createQueryBuilder = (firstResult: unknown = null) => ({
  create: vi.fn(() => ({
    select: () => ({ where: () => ({ limit: () => ({ first: async () => firstResult }) }) }),
  })),
});

const createCoreMock = (overrides: Record<string, unknown> = {}) => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  QueryBuilder: createQueryBuilder(),
  Sanitizer: {
    digitsOnly: String,
    nameText: (value: any) => (typeof value === 'string' ? value : ''),
    email: String,
    safePasswordChars: String,
  },
  Schema: { create: () => ({}) },
  Validator: { validate: vi.fn() },
  getValidatedBody: vi.fn(() => undefined),
  nowIso: vi.fn(() => '2026-04-07 00:00:00'),
  randomBytes: vi.fn(() => Buffer.from('password')), 
  useDatabase: vi.fn().mockReturnValue({}),
  ...overrides,
});

vi.mock('@zintrust/core', () => createCoreMock());

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
    vi.doMock('@zintrust/core', () =>
      createCoreMock({
        QueryBuilder: { create: vi.fn() },
        Sanitizer: {
          digitsOnly: () => '',
          nameText: (value: any) => (typeof value === 'string' ? value : ''),
          email: String,
          safePasswordChars: String,
        },
      })
    );

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
    vi.doMock('@zintrust/core', () => createCoreMock({ QueryBuilder: { create: vi.fn() } }));

    const { default: controller } = await import('@app/Controllers/UserQueryBuilderController');
    const { req, res } = makeReqRes();
    req.params = { id: '1' };
    req.user = undefined; // no subject

    await controller.create().show(req, res);
    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Unauthorized' });
  });

  it('show: returns 403 when subject mismatched', async () => {
    vi.resetModules();
    vi.doMock('@zintrust/core', () => createCoreMock({ QueryBuilder: { create: vi.fn() } }));

    const { default: controller } = await import('@app/Controllers/UserQueryBuilderController');
    const { req, res } = makeReqRes();
    req.params = { id: '1' };
    req.user = { sub: '2' };

    await controller.create().show(req, res);
    expect(res._calls.status).toBe(403);
    expect(res._calls.payload).toEqual({ error: 'Forbidden' });
  });

  it('show: success returns user data', async () => {
    vi.resetModules();
    vi.doMock('@zintrust/core', () =>
      createCoreMock({
        QueryBuilder: createQueryBuilder({ id: '1', name: 'A' }),
      })
    );

    const { default: controller } = await import('@app/Controllers/UserQueryBuilderController');
    const { req, res } = makeReqRes();
    req.params = { id: '1' };
    req.user = { sub: '1' };

    await controller.create().show(req, res);
    expect(res._calls.status).toBeUndefined();
    expect(res._calls.payload).toEqual({ data: { id: '1', name: 'A' } });
  });
});
