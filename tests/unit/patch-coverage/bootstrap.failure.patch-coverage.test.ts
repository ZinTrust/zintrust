/* eslint-disable max-nested-callbacks -- mock-heavy coverage tests intentionally nest factory callbacks */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/zintrust.plugins', () => ({}));

let exitSpy: ReturnType<typeof vi.spyOn>;

const mockRuntimeDependencies = (): void => {
  vi.doMock('@config/env', () => ({
    Env: {
      getInt: () => 0,
      get: () => 'localhost',
      getBool: (_key: string, defaultVal?: boolean) => defaultVal ?? false,
      getFloat: (_key: string, defaultVal?: number) => defaultVal ?? 0,
    },
  }));
  vi.doMock('@config/app', () => ({
    appConfig: { detectRuntime: () => 'nodejs' },
  }));
  vi.doMock('@scheduler/ScheduleRunner', () => ({
    create: () => ({ register: () => {}, start: () => {}, stop: async () => {} }),
  }));
  vi.doMock('@schedules', () => ({}));
  vi.doMock('@zintrust/workers', () => ({
    createQueueWorker: () => ({
      processOne: async () => true,
      processAll: async () => true,
      startWorker: async () => true,
    }),
    WorkerInit: {
      initialize: vi.fn(async () => undefined),
      autoStartPersistedWorkers: vi.fn(async () => undefined),
    },
    WorkerShutdown: {
      shutdown: vi.fn(async () => undefined),
    },
  }));
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as any);
  exitSpy.mockClear();
});

afterEach(() => {
  vi.doUnmock('@boot/Application');
  vi.doUnmock('@boot/Server');
  vi.doUnmock('@config/app');
  vi.doUnmock('@config/env');
  vi.doUnmock('@config/logger');
  vi.doUnmock('@scheduler/ScheduleRunner');
  vi.doUnmock('@schedules');
  vi.doUnmock('@zintrust/workers');
  vi.restoreAllMocks();
  vi.resetModules();
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGUSR2');
});

describe('patch coverage: bootstrap failure', () => {
  it('logs bootstrap start failures and exits with code 1', async () => {
    const bootError = new Error('boot fail');
    const loggerError = vi.fn();

    mockRuntimeDependencies();
    vi.doMock('@boot/Application', () => ({
      Application: {
        create: vi.fn(() => ({
          boot: vi.fn(async () => Promise.reject(bootError)),
          shutdown: vi.fn(async () => undefined),
          getContainer: vi.fn(() => ({ get: () => ({}) })),
        })),
      },
    }));
    vi.doMock('@boot/Server', () => ({
      Server: {
        create: vi.fn(() => ({ listen: async () => undefined })),
      },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), error: loggerError, warn: vi.fn(), debug: vi.fn() },
    }));

    const bootstrapModule = await import('@boot/bootstrap');
    await bootstrapModule.bootstrapReady;

    expect(loggerError).toHaveBeenCalledWith('Failed to bootstrap application:', bootError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('still exits when bootstrap error logging throws', async () => {
    const bootError = new Error('boot fail');
    const loggerError = vi.fn(() => {
      throw new Error('logger failed');
    });

    mockRuntimeDependencies();
    vi.doMock('@boot/Application', () => ({
      Application: {
        create: vi.fn(() => ({
          boot: vi.fn(async () => Promise.reject(bootError)),
          shutdown: vi.fn(async () => undefined),
          getContainer: vi.fn(() => ({ get: () => ({}) })),
        })),
      },
    }));
    vi.doMock('@boot/Server', () => ({
      Server: {
        create: vi.fn(() => ({ listen: async () => undefined })),
      },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), error: loggerError, warn: vi.fn(), debug: vi.fn() },
    }));

    const bootstrapModule = await import('@boot/bootstrap');
    await bootstrapModule.bootstrapReady;

    expect(loggerError).toHaveBeenCalledWith('Failed to bootstrap application:', bootError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
