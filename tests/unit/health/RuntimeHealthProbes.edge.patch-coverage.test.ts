import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/cloudflare', () => ({ Cloudflare: { getKVBinding: vi.fn() } }));
vi.mock('@config/env', () => ({ Env: { get: vi.fn() } }));
vi.mock('@exceptions/ZintrustError', () => ({
  ErrorFactory: {
    createConfigError: (m: string) => new Error(m),
    createConnectionError: (m: string) => new Error(m),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RuntimeHealthProbes edge cases', () => {
  it('getCacheDriverName: returns kv when env set', async () => {
    const { Env } = await import('@config/env');
    vi.mocked(Env.get as any).mockReturnValue('kv');

    const { RuntimeHealthProbes } = await import('@/../src/health/RuntimeHealthProbes');
    expect(RuntimeHealthProbes.getCacheDriverName()).toBe('kv');
  });

  it('pingKvCache: throws when KV binding missing', async () => {
    const { Env } = await import('@config/env');
    const { Cloudflare } = await import('@config/cloudflare');

    vi.mocked(Env.get as any).mockReturnValue('kv');
    vi.mocked(Cloudflare.getKVBinding as any).mockReturnValue(null);

    const { RuntimeHealthProbes } = await import('@/../src/health/RuntimeHealthProbes');

    await expect(RuntimeHealthProbes.pingKvCache(10)).rejects.toThrow(
      'KV binding "CACHE" not found'
    );
  });

  it('withTimeout: rejects when function times out', async () => {
    // const { ErrorFactory } = await import('@exceptions/ZintrustError');
    const { RuntimeHealthProbes } = await import('@/../src/health/RuntimeHealthProbes');

    // simulate kv path by mocking Env.get and Cloudflare.getKVBinding
    const { Env } = await import('@config/env');
    const { Cloudflare } = await import('@config/cloudflare');

    vi.mocked(Env.get as any).mockReturnValue('kv');

    const slowKv = {
      put: async () => {
        await new Promise((r) => setTimeout(r, 50));
      },
      get: async () => ({ ok: true }),
      delete: async () => {},
    };

    vi.mocked(Cloudflare.getKVBinding as any).mockReturnValue(slowKv);

    // small timeout to trigger
    await expect(RuntimeHealthProbes.pingKvCache(1)).rejects.toThrow();
  });
});
