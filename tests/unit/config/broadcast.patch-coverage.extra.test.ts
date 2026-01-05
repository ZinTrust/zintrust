import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_key: string, defaultVal?: string) => defaultVal ?? ''),
    getInt: vi.fn((_key: string, defaultVal?: number) => defaultVal ?? 0),
    getBool: vi.fn((_key: string, defaultVal?: boolean) => defaultVal ?? false),
  },
}));

describe('src/config/broadcast patch coverage (extra)', () => {
  it('throws when BROADCAST_DRIVER is unknown (no fallback)', async () => {
    const { Env } = await import('@config/env');
    (Env.get as unknown as Mock).mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'BROADCAST_DRIVER') return 'unknown';
      return defaultVal ?? '';
    });

    const broadcastConfig = (await import('@config/broadcast')).default;
    expect(() => broadcastConfig.default).toThrow(/Broadcast driver not configured/i);
  });

  it('falls back to inmemory config when selection is missing', async () => {
    const broadcastConfig = (await import('@config/broadcast')).default;

    const fakeConfig = {
      default: 'missing',
      drivers: {
        inmemory: { driver: 'inmemory' },
      },
    };

    const cfg = (broadcastConfig.getDriverConfig as any).call(fakeConfig, undefined);
    expect(cfg).toMatchObject({ driver: 'inmemory' });
  });

  it('throws when no broadcast drivers are configured', async () => {
    const broadcastConfig = (await import('@config/broadcast')).default;

    const fakeConfig = {
      default: 'missing',
      drivers: {},
    };

    expect(() => (broadcastConfig.getDriverConfig as any).call(fakeConfig, undefined)).toThrow(
      /No broadcast drivers are configured/i
    );
  });
});
