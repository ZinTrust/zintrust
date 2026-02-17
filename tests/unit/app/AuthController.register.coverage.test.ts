import { describe, expect, it, vi } from 'vitest';

const firstMock = vi.fn();
const insertMock = vi.fn();

vi.mock('@app/Models/User', () => ({
  User: {
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        first: (...args: unknown[]) => firstMock(...args),
      })),
    })),
    query: vi.fn(() => ({
      insert: (...args: unknown[]) => insertMock(...args),
    })),
  },
}));

vi.mock('@/auth/Auth', () => ({
  Auth: {
    hash: vi.fn(async () => 'hash'),
    compare: vi.fn(async () => true),
  },
}));

vi.mock('@http/ValidationHelper', () => ({
  getValidatedBody: () => ({ name: 'A', email: 'a@example.com', password: 'pw' }),
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AuthController } from '@app/Controllers/AuthController';
import { Logger } from '@config/logger';

describe('AuthController.register (coverage extras)', () => {
  it('falls back to selecting inserted user id when insert result has no id', async () => {
    // First lookup: no existing user
    firstMock.mockResolvedValueOnce(null);
    // Insert returns no id
    insertMock.mockResolvedValueOnce({ id: undefined });
    // Second lookup: inserted user present
    firstMock.mockResolvedValueOnce({ id: 123, name: 'A', email: 'a@example.com' });

    const api = AuthController.create();

    const res = {
      setStatus: vi.fn(function (this: any) {
        return this;
      }),
      json: vi.fn(),
    } as any;

    const req = {
      getRaw: () => ({ socket: { remoteAddress: '127.0.0.1' } }),
    } as any;

    await api.register(req, res);

    expect(res.setStatus).toHaveBeenCalledWith(201);
    expect(Logger.info).toHaveBeenCalledWith(
      'AuthController.register: successful registration',
      expect.objectContaining({ user_id: 123 })
    );
  });
});
