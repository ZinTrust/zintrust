import { describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_key: string, defaultVal?: string) => defaultVal ?? ''),
    getInt: vi.fn((_key: string, defaultVal?: number) => defaultVal ?? 0),
    getBool: vi.fn((_key: string, defaultVal?: boolean) => defaultVal ?? false),
  },
}));

describe('src/config/broadcast patch coverage (extra)', () => {
  it('normalizes socket authorizer and publish overrides from objects', async () => {
    vi.resetModules();

    const authorize = vi.fn();
    const publishAuthorize = vi.fn();

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFile: {
        Broadcast: 'config/broadcast.ts',
      },
      StartupConfigFileRegistry: {
        get: vi.fn(() => ({
          socket: {
            authorize: { authorize },
            publish: { authorize: publishAuthorize },
            authMiddleware: ['auth', 'jwt'],
            allowAuthRouteOverride: true,
          },
        })),
      },
    }));

    const broadcastConfig = (await import('@config/broadcast')).default;

    expect(broadcastConfig.socket.authorize).toEqual({ authorize });
    expect(broadcastConfig.socket.publish).toEqual({ authorize: publishAuthorize });
    expect(broadcastConfig.socket.authMiddleware).toEqual(['auth', 'jwt']);
    expect(broadcastConfig.socket.allowAuthRouteOverride).toBe(true);
  });

  it('keeps function-based socket authorizers as-is', async () => {
    vi.resetModules();

    const authorize = vi.fn();

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFile: {
        Broadcast: 'config/broadcast.ts',
      },
      StartupConfigFileRegistry: {
        get: vi.fn(() => ({
          socket: {
            authorize,
          },
        })),
      },
    }));

    const broadcastConfig = (await import('@config/broadcast')).default;

    expect(broadcastConfig.socket.authorize).toBe(authorize);
  });

  it('throws for invalid socket publish overrides', async () => {
    vi.resetModules();

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFile: {
        Broadcast: 'config/broadcast.ts',
      },
      StartupConfigFileRegistry: {
        get: vi.fn(() => ({
          socket: {
            authorize: { authorize: vi.fn() },
            publish: { authorize: 'nope' },
          },
        })),
      },
    }));

    const broadcastConfig = (await import('@config/broadcast')).default;

    expect(() => broadcastConfig.socket).toThrow(
      /broadcastConfig\.socket\.publish must be a function or an object with an authorize/
    );
  });

  it('throws for invalid socket authorizer overrides', async () => {
    vi.resetModules();

    vi.doMock('@runtime/StartupConfigFileRegistry', () => ({
      StartupConfigFile: {
        Broadcast: 'config/broadcast.ts',
      },
      StartupConfigFileRegistry: {
        get: vi.fn(() => ({
          socket: {
            authorize: { authorize: 'nope' },
          },
        })),
      },
    }));

    const broadcastConfig = (await import('@config/broadcast')).default;

    expect(() => broadcastConfig.socket).toThrow(
      /broadcastConfig\.socket\.authorize must be a function or an object with an authorize/
    );
  });

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
