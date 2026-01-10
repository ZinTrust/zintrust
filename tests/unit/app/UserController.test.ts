import { UserController } from '@app/Controllers/UserController';
import { useEnsureDbConnected } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(),
  useEnsureDbConnected: vi.fn(),
}));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(),
  },
}));

type MockRes = {
  status: Mock;
  json: Mock;
};

const createRes = (): MockRes => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn(),
});

describe('UserController', () => {
  it('fill: returns 422 when count is invalid', async () => {
    const db = {
      isConnected: () => true,
      connect: vi.fn(),
    };

    (useEnsureDbConnected as unknown as Mock).mockResolvedValue(db);

    const builder = {
      insert: vi.fn(),
    };

    (QueryBuilder.create as unknown as Mock).mockReturnValue(builder);

    const controller = UserController.create();

    const req = {
      body: { count: 'nope' },
      params: {},
    } as any;

    const res = createRes();

    await controller.fill(req, res as any);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.any(Object),
      })
    );
  });

  it('fill: inserts default number of users', async () => {
    const db = {
      isConnected: () => true,
      connect: vi.fn(),
    };

    (useEnsureDbConnected as unknown as Mock).mockResolvedValue(db);

    const builder = {
      insert: vi.fn().mockResolvedValue(undefined),
    };

    (QueryBuilder.create as unknown as Mock).mockReturnValue(builder);

    const controller = UserController.create();

    const req = {
      body: {},
      params: {},
    } as any;

    const res = createRes();

    await controller.fill(req, res as any);

    expect(builder.insert).toHaveBeenCalledTimes(10);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Users filled',
        count: 10,
      })
    );
  });

  it('update: rejects unknown fields', async () => {
    const db = {
      isConnected: () => true,
      connect: vi.fn(),
    };

    (useEnsureDbConnected as unknown as Mock).mockResolvedValue(db);

    // QueryBuilder shouldn't be called due to early validation
    (QueryBuilder.create as unknown as Mock).mockReturnValue({});

    const controller = UserController.create();

    const req = {
      body: { is_admin: true },
      params: { id: '1' },
    } as any;

    const res = createRes();

    await controller.update(req, res as any);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.objectContaining({
          is_admin: expect.any(Array),
        }),
      })
    );
  });
});
