import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCryptoDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

const setCrypto = (value: unknown): void => {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
  });
};

const restoreCrypto = (): void => {
  if (originalCryptoDesc) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDesc);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as any).crypto;
};

afterEach(() => {
  restoreCrypto();
  vi.resetModules();
  vi.unmock('@node-singletons/crypto');
});

const makeSequentialBuffer = (length: number, startAt: number): Buffer => {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = startAt + i;
  return Buffer.from(bytes);
};

const throwBoom = (): never => {
  throw new Error('boom');
};

describe('uuid helpers', () => {
  it('generateUuid uses crypto.randomUUID when available', async () => {
    setCrypto({ randomUUID: vi.fn(() => 'uuid-1') });

    const { generateUuid } = await import('@/common/uuid');

    expect(generateUuid()).toBe('uuid-1');
  });

  it('generateUuid falls back when crypto.randomUUID is unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));

    setCrypto({});

    const { generateUuid } = await import('@/common/uuid');

    const id = generateUuid();
    expect(id).toContain('1577836800000-');

    vi.useRealTimers();
  });

  it('generateSecureJobId uses crypto.randomUUID when available', async () => {
    setCrypto({ randomUUID: vi.fn(() => 'uuid-2') });

    const { generateSecureJobId } = await import('@/common/uuid');

    await expect(generateSecureJobId()).resolves.toBe('uuid-2');
  });

  it('generateSecureJobId uses crypto.getRandomValues when available', async () => {
    setCrypto({
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = i;
        return bytes;
      }),
    });

    const { generateSecureJobId } = await import('@/common/uuid');

    await expect(generateSecureJobId()).resolves.toBe('000102030405060708090a0b0c0d0e0f');
  });

  it('generateSecureJobId falls back to node crypto when Web Crypto is unavailable', async () => {
    setCrypto(undefined);

    const buf = makeSequentialBuffer(16, 1);
    const randomBytes = vi.fn().mockReturnValue(buf);

    vi.doMock('@node-singletons/crypto', () => ({
      randomBytes,
    }));

    const { generateSecureJobId } = await import('@/common/uuid');

    await expect(generateSecureJobId()).resolves.toBe('0102030405060708090a0b0c0d0e0f10');
  });

  it('generateSecureJobId throws a wrapped error when node crypto fails', async () => {
    setCrypto(undefined);

    vi.doMock('@node-singletons/crypto', () => ({
      randomBytes: vi.fn(throwBoom),
    }));

    const { generateSecureJobId } = await import('@/common/uuid');

    await expect(generateSecureJobId('')).rejects.toBeDefined();
  });
});
