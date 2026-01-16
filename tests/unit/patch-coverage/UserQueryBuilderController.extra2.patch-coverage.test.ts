import { QueryBuilder } from '@orm/QueryBuilder';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@orm/Database', () => ({ useDatabase: vi.fn().mockReturnValue({}) }));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(() => ({
      select: () => ({ where: () => ({ limit: () => ({ first: async () => null }) }) }),
    })),
  },
}));

vi.mock('@security/Sanitizer', () => ({
  Sanitizer: {
    digitsOnly: (v: any) => String(v),
    nameText: (v: any) => (typeof v === 'string' ? v : ''),
    email: (v: any) => String(v),
    safePasswordChars: (v: any) => String(v),
  },
}));

vi.mock('@validation/Validator', () => ({
  Validator: { validate: vi.fn() },
  Schema: { create: () => ({}) },
}));

import UserQueryBuilderController from '@app/Controllers/UserQueryBuilderController';

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
  const req = {
    body: {},
    params: {},
    getRaw: () => ({ socket: { remoteAddress: '127.0.0.1' } }),
    user: undefined,
  } as any;
  return { req, res };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage extra: UserQueryBuilderController forbidden/ownership', () => {
  it('update: returns 403 when updating another user', async () => {
    // Mock QueryBuilder to find the target user
    (QueryBuilder.create as any).mockReturnValueOnce({
      select: () => ({ where: () => ({ limit: () => ({ first: async () => ({ id: '2' }) }) }) }),
    });

    const { req, res } = makeReqRes();
    req.params = { id: '2' };
    req.user = { sub: '1' };
    req.body = { name: 'New' };

    await UserQueryBuilderController.create().update(req, res);
    expect(res._calls.status).toBe(403);
    expect(res._calls.payload).toEqual({ error: 'Forbidden' });
  });

  it('destroy: returns 403 when deleting another user', async () => {
    (QueryBuilder.create as any).mockReturnValueOnce({
      select: () => ({ where: () => ({ limit: () => ({ first: async () => ({ id: '2' }) }) }) }),
    });

    const { req, res } = makeReqRes();
    req.params = { id: '2' };
    req.user = { sub: '1' };

    await UserQueryBuilderController.create().destroy(req, res);
    expect(res._calls.status).toBe(403);
    expect(res._calls.payload).toEqual({ error: 'Forbidden' });
  });
});
