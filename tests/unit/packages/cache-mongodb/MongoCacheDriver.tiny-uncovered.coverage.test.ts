import { describe, expect, it, vi } from 'vitest';

vi.mock('@zintrust/core', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    Logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('packages/cache-mongodb MongoCacheDriver (targeted tiny uncovered)', () => {
  it('returns null when uri is empty and does not call fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any);

    try {
      const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

      const driver = MongoCacheDriver.create({
        driver: 'mongodb',
        uri: '',
        db: 'db',
        ttl: 1,
      });

      await expect(driver.get('k')).resolves.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('handles fetch errors and returns null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new Error('boom'));

    try {
      const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

      const driver = MongoCacheDriver.create({
        driver: 'mongodb',
        uri: 'https://example.com',
        db: 'db',
        ttl: 1,
      });

      await expect(driver.has('k')).resolves.toBe(false);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('deletes expired entries on get()', async () => {
    const now = Date.now();
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      json: async () => ({
        document: {
          value: 'v',
          expires: now - 1,
        },
      }),
    });

    try {
      const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

      const driver = MongoCacheDriver.create({
        driver: 'mongodb',
        uri: 'https://example.com',
        db: 'db',
        ttl: 1,
      });

      await expect(driver.get('k')).resolves.toBeNull();
      // findOne + deleteOne
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns values on get() when not expired and has() returns true', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      json: async () => ({
        document: {
          value: { ok: true },
          expires: null,
        },
      }),
    });

    try {
      const { MongoCacheDriver } = await import('../../../../packages/cache-mongodb/src/index');

      const driver = MongoCacheDriver.create({
        driver: 'mongodb',
        uri: 'https://example.com',
        db: 'db',
        ttl: 1,
      });

      await expect(driver.get('k')).resolves.toEqual({ ok: true });
      await expect(driver.has('k')).resolves.toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
