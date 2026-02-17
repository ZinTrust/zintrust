import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const mocked = vi.hoisted(() => {
  const runner = {
    register: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(async () => undefined),
    list: vi.fn(() => []),
    runOnce: vi.fn(async () => undefined),
  };

  const leader = {
    isEnabled: vi.fn(() => false),
    start: vi.fn(),
    stop: vi.fn(async () => undefined),
  };

  return {
    runner,
    leader,
    createScheduleRunner: vi.fn(() => runner),
    leaderCreate: vi.fn(() => leader),
  };
});

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@scheduler/index', () => ({
  createScheduleRunner: mocked.createScheduleRunner,
}));

vi.mock('@scheduler/leader/SchedulerLeader', () => ({
  SchedulerLeader: {
    create: mocked.leaderCreate,
  },
}));

describe('SchedulerRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocked.runner.register.mockReset();
    mocked.runner.start.mockReset();
    mocked.runner.stop.mockReset().mockResolvedValue(undefined);
    mocked.runner.list.mockReset().mockReturnValue([]);
    mocked.runner.runOnce.mockReset().mockResolvedValue(undefined);

    mocked.leader.isEnabled.mockReset().mockReturnValue(false);
    mocked.leader.start.mockReset();
    mocked.leader.stop.mockReset().mockResolvedValue(undefined);
  });

  it('registerMany ignores invalid schedules and enforces core/app precedence', async () => {
    const { SchedulerRuntime } = await import('@/scheduler/SchedulerRuntime');
    const { Logger } = await import('@config/logger');

    SchedulerRuntime.registerMany([
      undefined as any,
      null as any,
      {} as any,
      { name: '   ' } as any,
      { name: 'a', handler: vi.fn() } as any,
    ]);

    expect(mocked.runner.register).toHaveBeenCalledTimes(1);

    // Same-source repeat is ignored.
    SchedulerRuntime.registerMany([{ name: 'a', handler: vi.fn() } as any], 'core');
    expect(mocked.runner.register).toHaveBeenCalledTimes(1);

    // App overrides core once and logs.
    SchedulerRuntime.registerMany([{ name: 'a', handler: vi.fn() } as any], 'app');
    expect(mocked.runner.register).toHaveBeenCalledTimes(2);
    expect(Logger.info as unknown as Mock).toHaveBeenCalledWith(
      'Schedule overridden by app/Schedules',
      expect.objectContaining({ name: 'a' })
    );

    // App always wins afterwards.
    SchedulerRuntime.registerMany([{ name: 'a', handler: vi.fn() } as any], 'core');
    expect(mocked.runner.register).toHaveBeenCalledTimes(2);
  });

  it('start delegates directly to runner when leader mode is disabled', async () => {
    mocked.leader.isEnabled.mockReturnValue(false);
    const { SchedulerRuntime } = await import('@/scheduler/SchedulerRuntime');

    const kernel = { tag: 'k' } as any;
    SchedulerRuntime.start(kernel);

    expect(mocked.runner.start).toHaveBeenCalledTimes(1);
    expect(mocked.runner.start).toHaveBeenCalledWith(kernel);
    expect(mocked.leader.start).not.toHaveBeenCalled();
  });

  it('start uses leader hooks when leader mode is enabled and is idempotent', async () => {
    mocked.leader.isEnabled.mockReturnValue(true);

    let hooks: any;
    mocked.leader.start.mockImplementation((input: any) => {
      hooks = input;
    });

    const { SchedulerRuntime } = await import('@/scheduler/SchedulerRuntime');
    const kernel = { tag: 'k' } as any;

    SchedulerRuntime.start(kernel);
    SchedulerRuntime.start(kernel);

    expect(mocked.leader.start).toHaveBeenCalledTimes(1);
    expect(mocked.runner.start).toHaveBeenCalledTimes(0);

    hooks.onBecameLeader();
    expect(mocked.runner.start).toHaveBeenCalledTimes(1);
    expect(mocked.runner.start).toHaveBeenCalledWith(kernel);

    hooks.onLostLeadership();
    expect(mocked.runner.stop).toHaveBeenCalledTimes(1);
  });

  it('listWithState returns null states when runner has no getState', async () => {
    delete (mocked.runner as any).getState;
    mocked.runner.list.mockReturnValue([{ name: 'a' } as any, { name: 'b' } as any]);

    const { SchedulerRuntime } = await import('@/scheduler/SchedulerRuntime');

    const rows = await SchedulerRuntime.listWithState();
    expect(rows).toEqual([
      { schedule: { name: 'a' }, state: null },
      { schedule: { name: 'b' }, state: null },
    ]);
  });

  it('listWithState fetches state rows when runner provides getState', async () => {
    (mocked.runner as any).getState = vi.fn(async (name: string) => ({ name }));
    mocked.runner.list.mockReturnValue([{ name: 'a' } as any]);

    const { SchedulerRuntime } = await import('@/scheduler/SchedulerRuntime');

    const rows = await SchedulerRuntime.listWithState();
    expect(rows).toEqual([{ schedule: { name: 'a' }, state: { name: 'a' } }]);
    expect((mocked.runner as any).getState).toHaveBeenCalledWith('a');
  });

  it('stop stops leader (if started) and runner', async () => {
    mocked.leader.isEnabled.mockReturnValue(true);
    const { SchedulerRuntime } = await import('@/scheduler/SchedulerRuntime');

    SchedulerRuntime.start();
    await SchedulerRuntime.stop(123);

    expect(mocked.leader.stop).toHaveBeenCalledTimes(1);
    expect(mocked.runner.stop).toHaveBeenCalledTimes(1);
    expect(mocked.runner.stop).toHaveBeenCalledWith(123);
  });
});
