import { describe, expect, it, vi } from 'vitest';

describe('CacheRuntimeRegistration', () => {
  it('registers expected drivers from runtime config', async () => {
    vi.resetModules();

    const registerSpy = vi.fn();

    vi.doMock('@cache/CacheDriverRegistry', () => ({
      CacheDriverRegistry: { register: registerSpy },
    }));

    // Provide simple driver factories so imports succeed
    vi.doMock('@cache/drivers/MemoryDriver', () => ({
      MemoryDriver: { create: () => ({}) },
    }));
    vi.doMock('@cache/drivers/RedisDriver', () => ({
      RedisDriver: { create: () => ({}) },
    }));
    vi.doMock('@cache/drivers/MongoDriver', () => ({
      MongoDriver: { create: () => ({}) },
    }));
    vi.doMock('@cache/drivers/KVDriver', () => ({
      KVDriver: { create: () => ({}) },
    }));
    vi.doMock('@cache/drivers/KVRemoteDriver', () => ({
      KVRemoteDriver: { create: () => ({}) },
    }));

    const mod = await import('@cache/CacheRuntimeRegistration');

    // call with an empty config object - function ignores contents
    mod.registerCachesFromRuntimeConfig({} as any);

    // Expect several driver registrations
    expect(registerSpy).toHaveBeenCalled();
    const calledNames = registerSpy.mock.calls.map((c) => c[0]);
    expect(calledNames).toEqual(
      expect.arrayContaining(['memory', 'redis', 'mongodb', 'kv', 'kv-remote'])
    );
  });
});
