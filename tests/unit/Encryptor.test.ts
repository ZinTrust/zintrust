import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('Encryptor PBKDF2 behavior', () => {
  it('uses pbkdf2Sync when available and verifies hash', async () => {
    // Mock the crypto module used by Encryptor
    vi.doMock('@node-singletons/crypto', () => ({
      // no async pbkdf2
      pbkdf2: undefined,
      // synchronous PBKDF2: return deterministic buffer based on password and salt
      pbkdf2Sync: (
        password: string,
        salt: string,
        _iterations: number,
        _keyLen: number,
        _digest: string
      ) => Buffer.from(`${password}:${salt}`, 'utf8'),
      randomBytes: (n: number) => Buffer.from('a'.repeat(n)),
    }));

    // Ensure bcrypt import fails so Encryptor falls back to PBKDF2
    vi.doMock('bcrypt', () => {
      throw new Error('Cannot find module');
    });

    const { Encryptor } = await import('../../src/security/Encryptor');

    const password = 'hunter2';
    const hash = await Encryptor.hash(password);
    expect(typeof hash).toBe('string');
    expect(hash.startsWith('pbkdf2$')).toBe(true);

    const ok = await Encryptor.verify(password, hash);
    expect(ok).toBe(true);
  });

  it('throws security error when PBKDF2 is not available', async () => {
    vi.doMock('@node-singletons/crypto', () => ({
      pbkdf2: undefined,
      pbkdf2Sync: undefined,
      randomBytes: (n: number) => Buffer.from('a'.repeat(n)),
    }));

    // Ensure bcrypt import fails so there is no fallback
    vi.doMock('bcrypt', () => {
      throw new Error('Cannot find module');
    });

    const { Encryptor } = await import('../../src/security/Encryptor');

    await expect(Encryptor.hash('x')).rejects.toThrowError();
  });
});
