import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

async function loadHash(tag: string): Promise<typeof import('@/security/Hash')> {
  return import('@/security/Hash?v=' + tag);
}

describe('Hash', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('hashes with bcrypt rounds=12 by default', async () => {
    const mockBcrypt = {
      hash: vi.fn().mockResolvedValue('$2b$12$mockhashmockhashmockhashmockhashmockhashmockhashmo'),
      compare: vi.fn(),
    };

    vi.doMock('bcrypt', () => ({ default: mockBcrypt }));

    const { Hash } = await loadHash('default-rounds');
    const out = await Hash.hash('pw');

    expect(out).toBe('$2b$12$mockhashmockhashmockhashmockhashmockhashmockhashmo');
    expect(mockBcrypt.hash).toHaveBeenCalledWith('pw', 12);
  });

  it('hashWithRounds uses provided rounds', async () => {
    const mockBcrypt = {
      hash: vi.fn().mockResolvedValue('$2b$10$mockhashmockhashmockhashmockhashmockhashmockhashmo'),
      compare: vi.fn(),
    };

    vi.doMock('bcrypt', () => ({ default: mockBcrypt }));

    const { Hash } = await loadHash('custom-rounds');
    await Hash.hashWithRounds('pw', 10);

    expect(mockBcrypt.hash).toHaveBeenCalledWith('pw', 10);
  });

  it('verify returns true/false via bcrypt.compare', async () => {
    const mockBcrypt = {
      hash: vi.fn(),
      compare: vi.fn().mockResolvedValue(true),
    };

    vi.doMock('bcrypt', () => ({ default: mockBcrypt }));

    const { Hash } = await loadHash('verify');

    const validHash = `$2b$12$${'a'.repeat(53)}`;
    expect(Hash.isValidHash(validHash)).toBe(true);

    await expect(Hash.verify('pw', validHash)).resolves.toBe(true);
    expect(mockBcrypt.compare).toHaveBeenCalledWith('pw', validHash);

    await expect(Hash.verify('pw', 'not-a-hash')).resolves.toBe(false);
  });

  it('verify returns false if bcrypt throws', async () => {
    const mockBcrypt = {
      hash: vi.fn(),
      compare: vi.fn().mockRejectedValue(new Error('boom')),
    };

    vi.doMock('bcrypt', () => ({ default: mockBcrypt }));

    const { Hash } = await loadHash('verify-throws');

    const validHash = `$2b$12$${'a'.repeat(53)}`;
    await expect(Hash.verify('pw', validHash)).resolves.toBe(false);
  });

  it('throws ConfigError when bcrypt is unavailable', async () => {
    vi.doMock('bcrypt', () => {
      throw new Error('Cannot find module');
    });

    const { Hash } = await loadHash('no-bcrypt');

    await expect(Hash.hash('pw')).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'CONFIG_ERROR',
    });
  });
});
