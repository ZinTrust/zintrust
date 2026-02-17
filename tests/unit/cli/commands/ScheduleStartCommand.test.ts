import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  envGetBool: vi.fn(),
  envGetInt: vi.fn(),
  registerAll: vi.fn(async () => undefined),
  list: vi.fn(() => [{ name: 'a' }]),
  start: vi.fn(),
  stop: vi.fn(async () => undefined),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    getBool: (...args: any[]) => mocked.envGetBool(...args),
    getInt: (...args: any[]) => mocked.envGetInt(...args),
  },
}));
vi.mock('@config/logger', () => ({ Logger: mocked.logger }));
vi.mock('@cli/commands/schedule/ScheduleCliSupport', () => ({
  ScheduleCliSupport: {
    registerAll: (...args: any[]) => mocked.registerAll(...args),
  },
}));
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    list: (...args: any[]) => mocked.list(...args),
    start: (...args: any[]) => mocked.start(...args),
    stop: (...args: any[]) => mocked.stop(...args),
  },
}));

describe('ScheduleStartCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('exits early when schedules are disabled', async () => {
    mocked.envGetBool.mockReturnValue(false);
    const { ScheduleStartCommand } = await import('@cli/commands/ScheduleStartCommand');
    await ScheduleStartCommand.create().execute({} as any);
    expect(mocked.logger.info).toHaveBeenCalledWith(
      'Schedules are disabled (SCHEDULES_ENABLED=false); exiting'
    );
    expect(mocked.registerAll).not.toHaveBeenCalled();
  });

  it('starts and stops schedules on signal', async () => {
    mocked.envGetBool.mockReturnValue(true);
    mocked.envGetInt.mockReturnValue(123);

    const sigtermHandlers: Array<() => void> = [];
    const onceSpy = vi.spyOn(process, 'once').mockImplementation((event: any, cb: any) => {
      if (event === 'SIGTERM') sigtermHandlers.push(cb);
      return process as any;
    });

    const { ScheduleStartCommand } = await import('@cli/commands/ScheduleStartCommand');
    await ScheduleStartCommand.create().execute({} as any);

    sigtermHandlers.forEach((h) => h());

    expect(mocked.start).toHaveBeenCalledTimes(1);
    expect(mocked.stop).toHaveBeenCalledWith(123);

    onceSpy.mockRestore();
  });
});
