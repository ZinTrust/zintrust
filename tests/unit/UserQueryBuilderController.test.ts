import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserQueryBuilderController from '../../app/Controllers/UserQueryBuilderController';

vi.mock('@orm/Database', () => ({ useDatabase: vi.fn().mockReturnValue({}) }));
vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: { create: vi.fn().mockReturnValue({}) },
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const makeRes = () => {
  const calls: any = {};
  return {
    status: (s: number) => {
      calls.status = s;
      return { json: (payload: any) => (calls.payload = payload) };
    },
    json: (payload: any) => (calls.payload = payload),
    _calls: calls,
  } as any;
};

const controller = UserQueryBuilderController.create();

describe('UserQueryBuilderController - requireSelf and param handling', () => {
  it('responds 400 when id is missing', async () => {
    const req = {} as any; // no params
    const res = makeRes();

    await controller.show(req, res);

    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({ error: 'Missing user id' });
  });

  it('responds 401 when user not authenticated', async () => {
    const req = { params: { id: '1' } } as any; // no req.user
    const res = makeRes();

    await controller.show(req, res);

    expect(res._calls.status).toBe(401);
    expect(res._calls.payload).toEqual({ error: 'Unauthorized' });
  });

  it('responds 403 when subject does not match id', async () => {
    const req = { params: { id: '1' }, user: { sub: '2' } } as any;
    const res = makeRes();

    await controller.show(req, res);

    expect(res._calls.status).toBe(403);
    expect(res._calls.payload).toEqual({ error: 'Forbidden' });
  });
});

describe('UserQueryBuilderController.update - sanitizer errors', () => {
  it('returns 400 when Sanitizer.email throws while sanitizing update body', async () => {
    const err = new Error('Invalid email');
    (err as any).name = 'SanitizerError';

    // Replace the Sanitizer module for this test and re-import controller so that
    // the controller picks up the mocked sanitizer at module load
    vi.resetModules();
    vi.doMock('../../src/security/Sanitizer', () => ({
      Sanitizer: {
        nameText: (v: any) => v,
        email: () => {
          throw err;
        },
        safePasswordChars: (v: any) => v,
        digitsOnly: String,
      },
    }));

    const { default: mockedController } =
      await import('../../app/Controllers/UserQueryBuilderController');

    const req = { params: { id: '1' }, user: { sub: '1' }, body: { email: 'not-an-email' } } as any;
    const res = makeRes();

    await mockedController.create().update(req, res);

    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({
      error: 'Sanitizer.email() failed: Missing @ symbol in email (value: not-an-email)',
    });
  });
});
