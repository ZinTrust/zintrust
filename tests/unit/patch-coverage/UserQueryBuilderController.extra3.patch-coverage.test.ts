import { describe, it, vi } from 'vitest';

describe('UserQueryBuilderController (branches)', () => {
  it('returns 400 when id missing in show', async () => {
    vi.resetModules();

    vi.doMock('@config/logger', () => ({
      Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    }));
    vi.doMock('@orm/Database', () => ({ useDatabase: () => ({}) }));
    const createSimpleQueryBuilderMock = () => {
      const firstMock = async () => null;
      const limitMock = () => ({ first: firstMock });
      const whereMock = () => ({ limit: limitMock });
      const selectMock = () => ({ where: whereMock });

      return {
        select: selectMock,
        get: async () => [],
        insert: async () => ({}),
        update: async () => ({}),
        delete: async () => ({}),
        first: firstMock,
      };
    };

    vi.doMock('@orm/QueryBuilder', () => ({
      QueryBuilder: {
        create: createSimpleQueryBuilderMock,
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
    const createQueryBuilderMock = () => {
      let whereVal: unknown;

      const firstMock = async () =>
        whereVal === 'notfound'
          ? null
          : { id: whereVal, name: 'n', email: 'e', created_at: '', updated_at: '' };

      const limitMock = () => ({ first: firstMock });

      const whereMock = (_k: string, _op: string, val: unknown) => {
        whereVal = val;
        return { limit: limitMock };
      };

      const selectMock = () => ({ where: whereMock });

      return {
        select: selectMock,
        where: whereMock,
        limit: limitMock,
        first: async () => null,
        get: async () => [],
        insert: async () => ({}),
        update: async () => ({}),
        delete: async () => ({}),
      };
    };

    vi.doMock('@orm/QueryBuilder', () => ({
      QueryBuilder: {
        create: createQueryBuilderMock,
      },
    }));

    vi.doMock('@security/Sanitizer', () => ({
      Sanitizer: {
        digitsOnly: (v: any) => (typeof v === 'string' ? v : ''),
        nameText: String,
        email: String,
        safePasswordChars: String,
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

      const statusJson = (b: any, s: number) => {
        last = { status: s, body: b };
        return last;
      };

      const statusJsonObj = (s: number) => ({
        json: (b: any) => statusJson(b, s),
      });

      const status = statusJsonObj;

      const json = (b: any) => (last = { status: 200, body: b });

      return {
        status,
        json,
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
    expect(res2.getLast().status).toBe(400);

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
    expect(res3.getLast().status).toBe(400);

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
    expect(res4.getLast().status).toBe(400);

    // update: no fields -> 422
    const res5 = makeRes();
    await ctl.update(
      { params: { id: '1' }, user: { sub: '1' }, body: {}, getParam: (_k: string) => '1' } as any,
      res5
    );
    expect(res5.getLast()).toBeDefined();
    expect(res5.getLast().status).toBe(400);

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
    expect(res6.getLast().status).toBe(400);
  });
});
