import { describe, expect, test, vi } from 'vitest';

const loggerError = vi.fn();
vi.mock('@config/logger', () => ({
  Logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('Hash - extra branches', () => {
  test('isValidHash recognizes valid bcrypt string', async () => {
    const valid = '$2b$10$' + 'a'.repeat(53);
    const { Hash } = await import('@/security/Hash?v=is-valid');
    expect(Hash.isValidHash(valid)).toBe(true);
    expect(Hash.isValidHash('not-a-hash')).toBe(false);
  });

  test('hash uses bcrypt and rounds=12 by default', async () => {
    const mockBcrypt = { hash: vi.fn().mockResolvedValue('bcrypt-hash'), compare: vi.fn() };
    vi.doMock('bcryptjs', () => ({ default: mockBcrypt }));

    const { Hash } = await import('@/security/Hash?v=bcrypt-default');
    const hash = await Hash.hash('pw');

    expect(hash).toBe('bcrypt-hash');
    expect(mockBcrypt.hash).toHaveBeenCalledWith('pw', 12);
  });

  test('hashWithRounds normalizes rounds and calls bcrypt', async () => {
    const mockBcrypt = { hash: vi.fn().mockResolvedValue('hr-hash'), compare: vi.fn() };
    vi.doMock('bcryptjs', () => ({ default: mockBcrypt }));

    const { Hash } = await import('@/security/Hash?v=bcrypt-rounds');
    const hash = await Hash.hashWithRounds('pw', 14.9);

    expect(hash).toBe('hr-hash');
    expect(mockBcrypt.hash).toHaveBeenCalledWith('pw', 14);
  });

  test('hashWithRounds throws on invalid rounds', async () => {
    const mockBcrypt = { hash: vi.fn(), compare: vi.fn() };
    vi.doMock('bcryptjs', () => ({ default: mockBcrypt }));

    const { Hash } = await import('@/security/Hash?v=bcrypt-invalid-rounds');
    await expect(Hash.hashWithRounds('pw', 0)).rejects.toThrow(/Invalid bcrypt rounds/);
    await expect(Hash.hashWithRounds('pw', NaN)).rejects.toThrow(/Invalid bcrypt rounds/);
  });

  test('verify returns false for invalid hash format', async () => {
    const { Hash } = await import('@/security/Hash?v=verify-format');
    await expect(Hash.verify('pw', 'not-a-bcrypt')).resolves.toBe(false);
  });

  test('verify returns false and logs when bcrypt.compare throws', async () => {
    const mockBcrypt = { hash: vi.fn(), compare: vi.fn().mockRejectedValue(new Error('boom')) };
    vi.doMock('bcryptjs', () => ({ default: mockBcrypt }));

    const { Hash } = await import('@/security/Hash?v=bcrypt-verify-throws');
    const validBcrypt = '$2b$10$' + 'a'.repeat(53);
    const res = await Hash.verify('pw', validBcrypt);
    expect(res).toBe(false);
    expect(loggerError).toHaveBeenCalledWith('Password verify failed', expect.any(Error));
  });

  test('throws when bcrypt module shape invalid', async () => {
    vi.doMock('bcryptjs', () => ({ default: {} }));
    const { Hash } = await import('@/security/Hash?v=bcrypt-bad-shape');
    await expect(Hash.hash('pw')).rejects.toThrow();
  });
});
