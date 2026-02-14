import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runtime adapters + scheduler coverage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete (globalThis as { Deno?: unknown }).Deno;
  });

  it('CloudflareAdapter uses fallback logger when provided logger is empty', async () => {
    const { CloudflareAdapter } = await import('@/runtime/adapters/CloudflareAdapter');
    const adapter = CloudflareAdapter.create({ handler: async () => undefined });

    const logger = adapter.getLogger();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('DenoAdapter fallback logger and startServer delegates to Deno.serve', async () => {
    const serve = vi.fn(async (_opts: unknown, handler: (req: Request) => Promise<Response>) => {
      const req = new Request('https://example.test/ping', { method: 'GET' });
      await handler(req);
    });
    (globalThis as { Deno?: unknown }).Deno = {
      serve,
      env: { get: () => undefined, toObject: () => ({}) },
      openKv: async () => null,
      mainModule: 'file:///main.ts',
    };

    const { DenoAdapter } = await import('@/runtime/adapters/DenoAdapter');
    const adapter = DenoAdapter.create({
      handler: async (_req, res) => {
        (res as unknown as { statusCode: number }).statusCode = 204;
      },
      logger: {} as never,
    });

    const logger = adapter.getLogger();
    expect(typeof logger.debug).toBe('function');
    await adapter.startServer(3456, '127.0.0.1');
    expect(serve).toHaveBeenCalled();
  });

  it('FargateAdapter and NodeServerAdapter expose default logger functions', async () => {
    const { FargateAdapter } = await import('@/runtime/adapters/FargateAdapter');
    const fargate = FargateAdapter.create({ handler: async () => undefined });
    const fargateLogger = fargate.getLogger();
    fargateLogger.debug('x');
    fargateLogger.info('x');
    fargateLogger.warn('x');
    fargateLogger.error('x', new Error('e'));

    const { NodeServerAdapter } = await import('@/runtime/adapters/NodeServerAdapter');
    const node = NodeServerAdapter.create({ handler: async () => undefined });
    const nodeLogger = node.getLogger();
    nodeLogger.debug('x');
    nodeLogger.info('x');
    nodeLogger.warn('x');
    nodeLogger.error('x', new Error('e'));

    expect(node.supportsPersistentConnections()).toBe(true);
    expect(fargate.supportsPersistentConnections()).toBe(true);
  });

  it('ScheduleRunner register after start runs immediately and by interval', async () => {
    vi.useFakeTimers();
    const { create } = await import('@/scheduler/ScheduleRunner');

    let runCount = 0;
    const runner = create();
    runner.start();

    runner.register({
      name: 'dynamic',
      enabled: true,
      runOnStart: true,
      intervalMs: 25,
      handler: async () => {
        runCount += 1;
      },
    });

    await vi.advanceTimersByTimeAsync(60);
    expect(runCount).toBeGreaterThanOrEqual(2);

    await runner.stop();
  });
});
