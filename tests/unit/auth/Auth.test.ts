import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  genSalt: vi.fn(async () => 'salt'),
  hash: vi.fn(async () => 'hashed'),
  compare: vi.fn(async () => true),
  sign: vi.fn(() => 'token'),
  verify: vi.fn(() => ({ ok: true })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    genSalt: (...args: any[]) => mocked.genSalt(...args),
    hash: (...args: any[]) => mocked.hash(...args),
    compare: (...args: any[]) => mocked.compare(...args),
  },
  genSalt: (...args: any[]) => mocked.genSalt(...args),
  hash: (...args: any[]) => mocked.hash(...args),
  compare: (...args: any[]) => mocked.compare(...args),
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: (...args: any[]) => mocked.sign(...args),
    verify: (...args: any[]) => mocked.verify(...args),
  },
  sign: (...args: any[]) => mocked.sign(...args),
  verify: (...args: any[]) => mocked.verify(...args),
}));

describe('Auth', () => {
  it('hash/compare delegate to bcrypt and token methods delegate to jwt', async () => {
    const { Auth } = await import('@auth/Auth');

    await expect(Auth.hash('pw')).resolves.toBe('hashed');
    await expect(Auth.compare('pw', 'h')).resolves.toBe(true);

    const t = Auth.generateToken({ a: 1 }, 'secret' as any, '2h');
    expect(t).toBe('token');
    expect(mocked.sign).toHaveBeenCalledWith({ a: 1 }, 'secret', { expiresIn: '2h' });

    const payload = Auth.verifyToken<{ ok: boolean }>('token', 'secret' as any);
    expect(payload).toEqual({ ok: true });
    expect(mocked.verify).toHaveBeenCalled();
  });
});
