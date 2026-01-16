import { describe, it, vi } from 'vitest';

describe('UserQueryBuilderController (branches)', () => {
  it('returns 400 when id missing in show', async () => {
    vi.resetModules();

    vi.doMock('@config/logger', () => ({
      Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));
    vi.doMock('@orm/Database', () => ({ useDatabase: () => ({}) }));
    vi.doMock('@orm/QueryBuilder', () => ({
      QueryBuilder: {
        create: () => ({
          select: () => ({ where: () => ({ limit: () => ({ first: async () => null }) }) }),
          get: async () => [],
          insert: async () => ({}),
          update: async () => ({}),
          delete: async () => ({}),
          first: async () => null,
        }),
      },
    }));
    vi.doMock('@security/Sanitizer', () => ({ Sanitizer: { digitsOnly: () => '' } }));

    const mod = await import('@app/Controllers/UserQueryBuilderController');
    const ctl = mod.UserQueryBuilderController.create();

    let last: any = {};
    const res = {
      status: (s: number) => ({
        json: (b: any) => {
          last = { status: s, body: b };
          return last;
        },
      }),
      json: (b: any) => {
        last = { status: 200, body: b };
      },
    } as any;
    const req = {} as any;

    await ctl.show(req, res);
    expect(last).toBeDefined();
    expect(last.status).toBe(400);
  });

  it('returns 401/403/404 and success branches for show/update/destroy', async () => {
    vi.resetModules();

    const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    vi.doMock('@config/logger', () => ({ Logger: log }));

    vi.doMock('@orm/Database', () => ({ useDatabase: () => ({}) }));

    // QueryBuilder that reacts to the where value
    vi.doMock('@orm/QueryBuilder', () => ({
      QueryBuilder: {
        create: (_: string, __: any) => {
          let whereVal: unknown;
          return {
            select: () => ({
              where: (_k: string, _op: string, val: unknown) => {
                whereVal = val;
                return {
                  limit: () => ({
                    first: async () =>
                      whereVal === 'notfound'
                        ? null
                        : { id: whereVal, name: 'n', email: 'e', created_at: '', updated_at: '' },
                  }),
                };
              },
            }),
            where: (_k: string, _op: string, val: unknown) => {
              whereVal = val;
              return {
                limit: () => ({
                  first: async () => (whereVal === 'notfound' ? null : { id: whereVal }),
                }),
              };
            },
            limit: () => ({ first: async () => null }),
            first: async () => null,
            get: async () => [],
            insert: async () => ({}),
            update: async () => ({}),
            delete: async () => ({}),
          };
        },
      },
    }));

    vi.doMock('@security/Sanitizer', () => ({
      Sanitizer: {
        digitsOnly: (v: any) => (typeof v === 'string' ? v : ''),
        nameText: (v: any) => String(v),
        email: (v: any) => String(v),
        safePasswordChars: (v: any) => String(v),
      },
    }));
    vi.doMock('@validation/Validator', () => ({
      Validator: { validate: () => {} },
      Schema: { create: () => ({}) },
    }));

    const mod = await import('@app/Controllers/UserQueryBuilderController');
    const ctl = mod.UserQueryBuilderController.create();

    const makeRes = () => {
      let last: any = {};
      return {
        status: (s: number) => ({
          json: (b: any) => {
            last = { status: s, body: b };
            return last;
          },
        }),
        json: (b: any) => (last = { status: 200, body: b }),
        getLast: () => last,
      } as any;
    };

    // 401 when unauthenticated
    const res1 = makeRes();
    await ctl.index({ user: undefined } as any, res1);
    expect(res1.getLast()).toBeDefined();
    expect(res1.getLast().status).toBe(401);

    // 403 when subject mismatch
    const res2 = makeRes();
    await ctl.show(
      { params: { id: '123' }, user: { sub: '999' }, getParam: (_k: string) => '123' } as any,
      res2
    );
    expect(res2.getLast()).toBeDefined();
    expect(res2.getLast().status).toBe(403);

    // 404 when not found
    const res3 = makeRes();
    await ctl.show(
      {
        params: { id: 'notfound' },
        user: { sub: 'notfound' },
        getParam: (_k: string) => 'notfound',
      } as any,
      res3
    );
    expect(res3.getLast()).toBeDefined();
    expect(res3.getLast().status).toBe(404);

    // update: unknown field -> 422
    const res4 = makeRes();
    await ctl.update(
      {
        params: { id: '1' },
        user: { sub: '1' },
        body: { bad: 'x' },
        getParam: (_k: string) => '1',
      } as any,
      res4
    );
    expect(res4.getLast()).toBeDefined();
    expect(res4.getLast().status).toBe(422);

    // update: no fields -> 422
    const res5 = makeRes();
    await ctl.update(
      { params: { id: '1' }, user: { sub: '1' }, body: {}, getParam: (_k: string) => '1' } as any,
      res5
    );
    expect(res5.getLast()).toBeDefined();
    expect(res5.getLast().status).toBe(422);

    // destroy: not found
    const res6 = makeRes();
    await ctl.destroy(
      {
        params: { id: 'notfound' },
        user: { sub: 'notfound' },
        getParam: (_k: string) => 'notfound',
      } as any,
      res6
    );
    expect(res6.getLast()).toBeDefined();
    expect(res6.getLast().status).toBe(404);
  });
});
