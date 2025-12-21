import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerError = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    error: loggerError,
  },
}));

const userFind = vi.fn();

vi.mock('@app/Models/User', () => ({
  User: {
    find: userFind,
  },
}));

type ReqFake = {
  getBody: ReturnType<typeof vi.fn>;
  getParam: ReturnType<typeof vi.fn>;
};

type ResFake = {
  json: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
};

function createReq(overrides?: Partial<ReqFake>): ReqFake {
  return {
    getBody: vi.fn(() => ({})),
    getParam: vi.fn(() => '1'),
    ...overrides,
  };
}

function createRes(): ResFake {
  const res: ResFake = {
    json: vi.fn(() => undefined),
    setStatus: vi.fn(() => undefined),
  };

  res.setStatus.mockImplementation(() => res);
  return res;
}

describe('UserController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFind.mockReset();
  });

  it('index() returns empty list', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq();
    const res = createRes();

    await controller.index(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it('index() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq();
    const res = createRes();
    res.json.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    await controller.index(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error fetching users:', expect.any(Error));
    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch users' });
  });

  it('create() returns create form', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq();
    const res = createRes();

    await controller.create(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ form: 'Create User Form' });
  });

  it('store() returns 422 when name is undefined', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getBody: vi.fn(() => ({ email: 'a@b.com' })),
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.setStatus).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed' });
  });

  it('store() returns 422 when name is null', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getBody: vi.fn(() => ({ name: null, email: 'a@b.com' })),
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.setStatus).toHaveBeenCalledWith(422);
  });

  it('store() returns 422 when email is undefined', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getBody: vi.fn(() => ({ name: 'Alice' })),
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.setStatus).toHaveBeenCalledWith(422);
  });

  it('store() returns 422 when email is null', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getBody: vi.fn(() => ({ name: 'Alice', email: null })),
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.setStatus).toHaveBeenCalledWith(422);
  });

  it('store() returns 201 on success', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const body = { name: 'Alice', email: 'a@b.com' };
    const req = createReq({
      getBody: vi.fn(() => body),
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.setStatus).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'User created', user: body });
  });

  it('store() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getBody: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error creating user:', expect.any(Error));
    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create user' });
  });

  it('show() returns param id', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getParam: vi.fn(() => '123'),
    });
    const res = createRes();

    await controller.show(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ data: { id: '123' } });
  });

  it('show() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getParam: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const res = createRes();

    await controller.show(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error fetching user:', expect.any(Error));
    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch user' });
  });

  it('edit() returns edit form', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getParam: vi.fn(() => '7'),
    });
    const res = createRes();

    await controller.edit(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ form: 'Edit User 7' });
  });

  it('edit() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getParam: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const res = createRes();

    await controller.edit(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error loading edit form:', expect.any(Error));
    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to load edit form' });
  });

  it('update() returns updated user', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getParam: vi.fn(() => '9'),
      getBody: vi.fn(() => ({ name: 'Bob' })),
    });
    const res = createRes();

    await controller.update(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({
      message: 'User updated',
      user: { id: '9', name: 'Bob' },
    });
  });

  it('update() logs and returns 500 on error', async () => {
    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({
      getParam: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const res = createRes();

    await controller.update(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error updating user:', expect.any(Error));
    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update user' });
  });

  it('destroy() deletes found user', async () => {
    const deleteMock = vi.fn(async () => undefined);
    userFind.mockResolvedValueOnce({ delete: deleteMock });

    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({ getParam: vi.fn(() => '5') });
    const res = createRes();

    await controller.destroy(req as unknown as never, res as unknown as never);

    expect(userFind).toHaveBeenCalledWith('5');
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ message: 'User deleted' });
  });

  it('destroy() handles missing user (optional chaining)', async () => {
    userFind.mockResolvedValueOnce(undefined);

    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({ getParam: vi.fn(() => '5') });
    const res = createRes();

    await controller.destroy(req as unknown as never, res as unknown as never);

    expect(res.json).toHaveBeenCalledWith({ message: 'User deleted' });
  });

  it('destroy() logs and returns 500 on error', async () => {
    userFind.mockRejectedValueOnce(new Error('boom'));

    const { UserController } = await import('@app/Controllers/UserController');
    const controller = new UserController();

    const req = createReq({ getParam: vi.fn(() => '5') });
    const res = createRes();

    await controller.destroy(req as unknown as never, res as unknown as never);

    expect(loggerError).toHaveBeenCalledWith('Error deleting user:', expect.any(Error));
    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete user' });
  });
});
