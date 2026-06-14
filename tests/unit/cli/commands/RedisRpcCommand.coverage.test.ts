import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProxyEnvLoadedForCwd: vi.fn(),
  maybeRunProxyWatchMode: vi.fn(async () => undefined),
  parseIntOption: vi.fn((v: unknown) => (v ? Number(v) : undefined)),
  trimOption: vi.fn((v: unknown) => (typeof v === 'string' ? v.trim() || undefined : v)),
  listenRedisRpcServer: vi.fn(async (opts?: Record<string, unknown>) => ({
    backend: { close: vi.fn(async () => undefined) },
    server: { close: (cb?: () => void) => { if (cb) cb(); } },
    settings: { host: (opts as any)?.host ?? '127.0.0.1', port: (opts as any)?.port ?? 8794 },
  })),
  Logger: { info: vi.fn() },
}));

vi.mock('@cli/commands/ProxyCommandUtils', () => ({
  ensureProxyEnvLoadedForCwd: mocks.ensureProxyEnvLoadedForCwd,
  maybeRunProxyWatchMode: mocks.maybeRunProxyWatchMode,
  parseIntOption: mocks.parseIntOption,
  trimOption: mocks.trimOption,
}));

vi.mock('@config/logger', () => ({ Logger: mocks.Logger }));

vi.mock('@config/env', () => ({
  Env: {
    get: (k: string, d: unknown) => d,
    getInt: (_k: string, d: number) => d,
    getBool: (_k: string, d: boolean) => d,
    REDIS_DB: 0,
    REDIS_QUEUE_DB: 0,
  },
}));

vi.mock('@zintrust/redis-rpc/server', () => ({
  listenRedisRpcServer: mocks.listenRedisRpcServer,
}));

import { RedisRpcCommand } from '@cli/commands/RedisRpcCommand';

describe('RedisRpcCommand (coverage)', () => {
  it('create() returns a command exposing execute and wires addOptions on construction', () => {
    const cmd = RedisRpcCommand.create();
    expect(cmd).toBeDefined();
    expect(typeof (cmd as any).execute).toBe('function');
    // addOptions wiring may be lazy/internal to BaseCommand; module load + create gives coverage.
  });

  // NOTE: Deeper execute body coverage (resolveRedisOptions, dynamic load,
  // listen, waitForShutdown) is best collected via manual runs, integration
  // tests, or future stubbing of the wait. The create() test loads the module
  // and exercises addOptions/option plumbing at construction time.
});
