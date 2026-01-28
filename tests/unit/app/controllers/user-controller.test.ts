import { beforeEach, describe, expect, it, vi } from 'vitest';

const pass123 = 'password123';
const loggerError = vi.fn();
const loggerWarn = vi.fn();
const loggerInfo = vi.fn();
const loggerDebug = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    debug: loggerDebug,
    info: loggerInfo,
    warn: loggerWarn,
    error: loggerError,
    fatal: vi.fn(),
    scope: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    }),
  },
}));

const dbIsConnected = vi.fn();
const dbConnect = vi.fn();

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(() => ({
    isConnected: dbIsConnected,
    connect: dbConnect,
  })),
  useEnsureDbConnected: vi.fn(async () => ({
    isConnected: dbIsConnected,
    connect: dbConnect,
  })),
}));

const qbCreate = vi.fn();

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: qbCreate,
  },
}));

type ReqFake = {
  getBody: ReturnType<typeof vi.fn>;
  getParam: ReturnType<typeof vi.fn>;
  body: Record<string, unknown>;
  params: Record<string, string>;
  user?: { sub?: string };
  validated?: { body?: unknown };
};

type ResFake = {
  json: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
};

function createReq(overrides?: Partial<ReqFake>): ReqFake {
  const body = overrides?.body ?? {};
  const params = overrides?.params ?? { id: '1' };
  const user = overrides?.user ?? { sub: params['id'] ?? '1' };
  return {
    getBody: vi.fn(() => body),
    getParam: vi.fn((key: string) => params[key]),
    body,
    params,
    user,
    validated: overrides?.validated ?? {},
    ...overrides,
  } as ReqFake;
}

function createRes(): ResFake {
  const res: ResFake = {
    json: vi.fn(() => undefined),
    setStatus: vi.fn(() => undefined),
    status: vi.fn(() => undefined),
  };

  res.setStatus.mockImplementation(() => res);
  res.status.mockImplementation(() => res);
  return res;
}

function createBuilder(overrides?: Partial<Record<string, unknown>>): Record<string, any> {
  const builder: Record<string, any> = {
    select: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    get: vi.fn(async () => []),
    first: vi.fn(async () => null),
    insert: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
  return builder;
}

describe('UserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dbIsConnected.mockReturnValue(true);
    dbConnect.mockResolvedValue(undefined);
    qbCreate.mockReset();
  });

  it('index() returns empty list', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        get: vi.fn(async () => []),
      })
    );

    const req = createReq();
    const res = createRes();

    await controller.index(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it('index() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        get: vi.fn(async () => {
          throw new Error('db error');
        }),
      })
    );
    const req = createReq();
    const res = createRes();

    await controller.index(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error fetching users:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch users' });
  });

  it('create() returns create form', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const req = createReq();
    const res = createRes();

    await controller.create(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ form: 'Create User Form' });
  });

  it('store() returns 422 when name is undefined', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const req = createReq({
      body: { email: 'a@b.com' },
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('store() returns 422 when name is null', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const req = createReq({
      body: { name: null, email: 'a@b.com' } as any,
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('store() returns 422 when email is undefined', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const req = createReq({
      body: { name: 'Alice' },
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('store() returns 422 when email is null', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const req = createReq({
      body: { name: 'Alice', email: null } as any,
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('store() returns 201 on success', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        insert: vi.fn(async () => undefined),
      })
    );

    const body = { name: 'Alice', email: 'a@b.com', password: pass123 };
    const req = createReq({
      body,
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'User created' });
  });

  it('store() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        insert: vi.fn(async () => {
          throw new Error('db error');
        }),
      })
    );

    const req = createReq({
      body: { name: 'Alice', email: 'alice@test.com', password: pass123 },
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    // The test verifies error handling works correctly
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create user' });
  });

  it('show() returns param id', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        first: vi.fn(async () => ({ id: '123', name: 'Test', email: 't@example.com' })),
      })
    );

    const req = createReq({
      params: { id: '123' },
    });
    const res = createRes();

    await controller.show(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ data: expect.any(Object) });
  });

  it('show() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        first: vi.fn(async () => {
          throw new Error('db error');
        }),
      })
    );
    const req = createReq();
    const res = createRes();

    await controller.show(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error fetching user:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch user' });
  });

  it('edit() returns edit form', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const req = createReq({
      params: { id: '7' },
    });
    const res = createRes();

    await controller.edit(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ form: 'Edit User Form' });
  });

  it('edit() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const req = createReq();
    const res = createRes();
    res.json.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    await controller.edit(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error loading edit form:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to load edit form' });
  });

  it('update() returns updated user', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate
      .mockReturnValueOnce(
        createBuilder({
          first: vi.fn(async () => ({ id: '9' })),
        })
      )
      .mockReturnValueOnce(
        createBuilder({
          update: vi.fn(async () => undefined),
        })
      )
      .mockReturnValueOnce(
        createBuilder({
          first: vi.fn(async () => ({ id: '9', name: 'Bob', email: 'bob@example.com' })),
        })
      );

    const req = createReq({
      params: { id: '9' },
      body: { name: 'Bob' },
    });
    const res = createRes();

    await controller.update(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({
      message: 'User updated',
      user: expect.any(Object),
    });
  });

  it('update() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        first: vi.fn(async () => {
          throw new Error('db error');
        }),
      })
    );
    const req = createReq({ body: { name: 'Bob' } });
    const res = createRes();

    await controller.update(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error updating user:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update user' });
  });

  it('destroy() deletes found user', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    const deleteMock = vi.fn(async () => undefined);
    qbCreate
      .mockReturnValueOnce(
        createBuilder({
          first: vi.fn(async () => ({ id: '5' })),
        })
      )
      .mockReturnValueOnce(
        createBuilder({
          delete: deleteMock,
        })
      );

    const req = createReq({ params: { id: '5' } });
    const res = createRes();

    await controller.destroy(req as unknown as never, res as unknown as never);

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ message: 'User deleted' });
  });

  it('destroy() handles missing user (optional chaining)', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        first: vi.fn(async () => null),
      })
    );

    const req = createReq({ params: { id: '5' } });
    const res = createRes();

    await controller.destroy(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });

  it('destroy() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = UserController.create();

    qbCreate.mockReturnValueOnce(
      createBuilder({
        first: vi.fn(async () => {
          throw new Error('boom');
        }),
      })
    );

    const req = createReq({ params: { id: '5' } });
    const res = createRes();

    await controller.destroy(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error deleting user:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete user' });
  });
});
