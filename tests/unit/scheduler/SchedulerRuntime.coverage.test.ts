import { describe, expect, it, vi } from 'vitest';

const runnerMock = vi.hoisted(() => ({
  register: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(async () => undefined),
  list: vi.fn(() => [{ name: 's1', handler: vi.fn() }]),
  runOnce: vi.fn(async () => undefined),
}));

vi.mock('@scheduler/index', () => ({
  createScheduleRunner: () => runnerMock,
}));

vi.mock('@scheduler/leader/SchedulerLeader', () => ({
  SchedulerLeader: {
    create: () => ({
      isEnabled: () => false,
      start: vi.fn(),
      stop: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SchedulerRuntime } from '../../../../src/scheduler/SchedulerRuntime';

describe('SchedulerRuntime (coverage extras)', () => {
  it('list() delegates to runner.list()', () => {
    const out = SchedulerRuntime.list();
    expect(runnerMock.list).toHaveBeenCalledTimes(1);
    expect(out[0]?.name).toBe('s1');
  });

  it('runOnce() delegates to runner.runOnce()', async () => {
    await SchedulerRuntime.runOnce('s1');
    expect(runnerMock.runOnce).toHaveBeenCalledWith('s1', undefined);
  });
});
