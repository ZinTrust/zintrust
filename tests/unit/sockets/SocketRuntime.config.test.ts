import { describe, expect, it, vi } from 'vitest';

const buildExplicitEnv = () => ({
  get: vi.fn((key: string, fallback?: string) => {
    if (key === 'SOCKET_TRANSPORT') return 'cloudflare';
    if (key === 'SOCKET_PATH') return '/ws///';
    if (key === 'PUSHER_APP_ID') return 'app-1';
    if (key === 'PUSHER_APP_KEY') return 'key-1';
    if (key === 'PUSHER_APP_SECRET') return 'secret-1';
    return fallback ?? '';
  }),
  getBool: vi.fn(() => true),
  getInt: vi.fn(() => 45),
});

const buildFallbackEnv = () => ({
  get: vi.fn((_key: string, fallback?: string) => fallback ?? ''),
  getInt: vi.fn((_key: string, fallback?: number) => fallback ?? 120),
});

describe('SocketFeature settings', () => {
  it('resolves explicit cloudflare transport from env', async () => {
    vi.resetModules();
    vi.doMock('@config/env', () => ({
      Env: buildExplicitEnv(),
    }));

    const { SocketFeature } = await import('../../../src/sockets/SocketRuntime');

    expect(SocketFeature.getSettings()).toMatchObject({
      enabled: true,
      transport: 'cloudflare',
      path: '/ws',
      activityTimeout: 45,
    });
  });

  it('falls back when boolean env helpers are unavailable', async () => {
    vi.resetModules();
    vi.doMock('@config/env', () => ({
      Env: buildFallbackEnv(),
    }));

    const { SocketFeature } = await import('../../../src/sockets/SocketRuntime');

    expect(SocketFeature.getSettings()).toMatchObject({
      enabled: false,
      transport: 'auto',
    });
  });
});
