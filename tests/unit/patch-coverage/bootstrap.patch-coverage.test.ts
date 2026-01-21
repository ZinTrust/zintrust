import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock heavy dependencies before importing bootstrap to avoid real side-effects
vi.mock('@boot/Application', () => ({
  Application: {
    create: vi.fn(() => ({
      boot: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      getContainer: vi.fn(() => ({ get: () => ({ add: vi.fn() }) })),
    })),
  },
}));

vi.mock('@boot/Server', () => ({
  Server: {
    create: vi.fn(() => ({
      listen: async () => {},
      close: async () => {},
      getHttpServer: () => ({}),
    })),
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    getInt: () => 0,
    get: () => 'localhost',
    getBool: (_key: string, defaultVal?: boolean) => defaultVal ?? false,
    getFloat: (_key: string, defaultVal?: number) => defaultVal ?? 0,
  },
}));
vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Runtime schedules helpers
vi.mock('@config/app', () => ({
  appConfig: { detectRuntime: () => 'nodejs' },
}));
vi.mock('@/scheduler/ScheduleRunner', () => ({
  create: () => ({ register: () => {}, start: () => {}, stop: async () => {} }),
}));
vi.mock('@/schedules', () => ({}));

vi.mock('@zintrust/workers', () => ({
  WorkerInit: {
    initialize: vi.fn(async () => undefined),
    autoStartPersistedWorkers: vi.fn(async () => undefined),
  },
  WorkerShutdown: {
    shutdown: vi.fn(async () => undefined),
  },
}));

// Prevent actual process.exit during module import
const exitSpy = vi
  .spyOn(process, 'exit')
  .mockImplementation(((_code?: number) => undefined) as any);

beforeEach(() => {
  vi.clearAllMocks();
  exitSpy.mockClear();
});

describe('patch coverage: bootstrap', () => {
  it('imports bootstrap and runs start without exiting', async () => {
    // Dynamic import executes top-level await/startup; mocks above are hoisted
    await import('@/boot/bootstrap');

    const appMod = await import('@boot/Application');
    const srvMod = await import('@boot/Server');
    const logger = await import('@config/logger');

    expect(typeof appMod.Application.create).toBe('function');
    expect(typeof srvMod.Server.create).toBe('function');
    // Ensure bootstrap logged running info
    expect(logger.Logger.info).toHaveBeenCalled();
    // process.exit should not have been called during successful bootstrap
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
