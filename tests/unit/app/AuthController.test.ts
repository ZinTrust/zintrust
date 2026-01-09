import { AuthController } from '@app/Controllers/AuthController';
import { Auth } from '@features/Auth';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(),
}));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    create: vi.fn(),
  },
}));

vi.mock('@features/Auth', () => ({
  Auth: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

type MockRes = {
  setStatus: Mock;
  json: Mock;
};

const createRes = (): MockRes => ({
  setStatus: vi.fn().mockReturnThis(),
  json: vi.fn(),
});

describe('AuthController', () => {
  it('register: returns 409 when email exists', async () => {
    const db = { isConnected: () => true, connect: vi.fn() };
    (useDatabase as unknown as Mock).mockReturnValue(db);

    const findBuilder = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 1, email: 'a@example.com' }),
    };

    (QueryBuilder.create as unknown as Mock).mockReturnValue(findBuilder);

    const controller = AuthController.create();

    const req = {
      body: { name: 'A', email: 'a@example.com', password: 'passwordpassword' },
    } as any;

    const res = createRes();

    await controller.register(req, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email already registered' });
  });

  it('login: returns 401 on invalid password', async () => {
    const db = { isConnected: () => true, connect: vi.fn() };
    (useDatabase as unknown as Mock).mockReturnValue(db);

    const findBuilder = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 1, email: 'a@example.com', password: 'hash' }),
    };

    (QueryBuilder.create as unknown as Mock).mockReturnValue(findBuilder);

    (Auth.compare as unknown as Mock).mockResolvedValue(false);

    const controller = AuthController.create();

    const req = {
      body: { email: 'a@example.com', password: 'wrong' },
    } as any;

    const res = createRes();

    await controller.login(req, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
  });
});
