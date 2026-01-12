import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  body: Record<string, unknown>;
  params: Record<string, string>;
};

type ResFake = {
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
};

function createReq(overrides?: Partial<ReqFake>): ReqFake {
  return {
    body: overrides?.body ?? {},
    params: overrides?.params ?? {},
  } as ReqFake;
}

function createRes(): ResFake {
  const res: ResFake = {
    json: vi.fn(() => undefined),
    status: vi.fn(() => undefined),
  };

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
    ...(overrides ?? {}),
  };
  return builder;
}

describe('UserQueryBuilderController validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dbIsConnected.mockReturnValue(true);
    dbConnect.mockResolvedValue(undefined);
    qbCreate.mockReset();
  });

  it('store() returns 422 when required fields are missing', async () => {
    const { UserQueryBuilderController } =
      await import('@app/Controllers/UserQueryBuilderController');
    const controller = UserQueryBuilderController.create();

    const req = createReq({ body: { email: 'a@b.com' } });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('store() returns 422 for invalid email', async () => {
    const { UserQueryBuilderController } =
      await import('@app/Controllers/UserQueryBuilderController');
    const controller = UserQueryBuilderController.create();

    const req = createReq({
      body: { name: 'Alice', email: 'not-an-email', password: 'password1' },
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('store() inserts and returns 201 when valid', async () => {
    const { UserQueryBuilderController } =
      await import('@app/Controllers/UserQueryBuilderController');
    const controller = UserQueryBuilderController.create();

    const insert = vi.fn(async () => undefined);
    qbCreate.mockReturnValueOnce(createBuilder({ insert }));

    const req = createReq({
      body: { name: 'Alice', email: 'alice@example.com', password: 'password1' },
    });
    const res = createRes();

    await controller.store(req as unknown as never, res as unknown as never);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Alice',
        email: 'alice@example.com',
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'User created' });
  });

  it('fill() returns 201 and clamps when count is out of bounds', async () => {
    const { UserQueryBuilderController } =
      await import('@app/Controllers/UserQueryBuilderController');
    const controller = UserQueryBuilderController.create();

    qbCreate.mockReturnValue(createBuilder());

    const req = createReq({ body: { count: 0 } });
    const res = createRes();

    await controller.fill(req as unknown as never, res as unknown as never);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 1,
      })
    );
  });
});
