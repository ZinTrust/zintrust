import { describe, expect, it, vi } from 'vitest';

vi.mock('@cli/commands/schedule/ScheduleCliSupport', () => ({
  ScheduleCliSupport: {
    registerAll: vi.fn(async () => undefined),
    shutdownCliResources: vi.fn(async () => undefined),
  },
}));

const listWithStateMock = vi.fn();
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    listWithState: (...args: unknown[]) => listWithStateMock(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ScheduleListCommand } from '@cli/commands/ScheduleListCommand';
import { Logger } from '@config/logger';

describe('ScheduleListCommand (coverage extras)', () => {
  it('prints cron cadence including tz suffix', async () => {
    listWithStateMock.mockResolvedValueOnce([
      {
        schedule: {
          name: 'a',
          cron: '*/5 * * * *',
          timezone: 'UTC',
          enabled: true,
          runOnStart: false,
        },
        state: null,
      },
    ]);

    const cmd = ScheduleListCommand.create();
    await cmd.execute({ args: [], json: false });

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('cron=*/5 * * * * tz=UTC'));
  });
});
