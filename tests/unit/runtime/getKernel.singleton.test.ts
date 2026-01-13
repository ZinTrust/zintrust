import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('getKernel connector', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('initializes only once (concurrent calls)', async () => {
    const boot = vi.fn().mockResolvedValue(undefined);
    const getRouter = vi.fn(() => ({ router: true }));
    const getContainer = vi.fn(() => ({ container: true }));

    const mockApp = {
      boot,
      getRouter,
      getContainer,
    };

    const createApp = vi.fn(() => mockApp);

    const createKernel = vi.fn(() => ({
      handle: vi.fn(),
      handleRequest: vi.fn(),
      terminate: vi.fn(),
      registerGlobalMiddleware: vi.fn(),
      registerRouteMiddleware: vi.fn(),
      getRouter: vi.fn(),
      getContainer: vi.fn(),
      getMiddlewareStack: vi.fn(),
      registerSchedule: vi.fn(),
      startSchedules: vi.fn(),
      stopSchedules: vi.fn(),
      runScheduleOnce: vi.fn(),
    }));

    vi.doMock('@boot/Application', () => ({
      Application: { create: createApp },
    }));

    vi.doMock('@http/Kernel', () => ({
      Kernel: { create: createKernel },
    }));

    const mod = await import('@runtime/getKernel');
    mod.__resetKernelForTests();

    await Promise.all([mod.getKernel(), mod.getKernel(), mod.getKernel()]);

    expect(createApp).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledTimes(1);
    expect(createKernel).toHaveBeenCalledTimes(1);

    expect(getRouter).toHaveBeenCalledTimes(1);
    expect(getContainer).toHaveBeenCalledTimes(1);
  });

  it('allows retry after initialization failure', async () => {
    const createApp = vi.fn(() => {
      throw new Error('create failed');
    });

    vi.doMock('@boot/Application', () => ({
      Application: { create: createApp },
    }));

    vi.doMock('@http/Kernel', () => ({
      Kernel: { create: vi.fn() },
    }));

    const mod = await import('@runtime/getKernel');
    mod.__resetKernelForTests();

    await expect(mod.getKernel()).rejects.toThrow(/create failed/);
    await expect(mod.getKernel()).rejects.toThrow(/create failed/);

    expect(createApp).toHaveBeenCalledTimes(2);
  });
});
