import { describe, expect, it, vi } from 'vitest';

vi.mock('@cli/commands/schedule/ScheduleCliSupport', () => ({
  ScheduleCliSupport: {
    registerAll: vi.fn(async () => undefined),
    shutdownCliResources: vi.fn(async () => undefined),
  },
}));

const runOnceMock = vi.fn(async () => undefined);
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    runOnce: (...args: unknown[]) => runOnceMock(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ScheduleRunCommand } from '@cli/commands/ScheduleRunCommand';
import { Logger } from '@config/logger';

describe('ScheduleRunCommand (coverage extras)', () => {
  it('logs completion after running schedule', async () => {
    const cmd = ScheduleRunCommand.create();
    await cmd.execute({ args: [], name: 'jobTracking.cleanup' });

    expect(Logger.info).toHaveBeenCalledWith('Schedule run completed', {
      name: 'jobTracking.cleanup',
    });
  });
});
