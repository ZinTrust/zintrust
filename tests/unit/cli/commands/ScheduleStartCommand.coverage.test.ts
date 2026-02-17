import { describe, expect, it, vi } from 'vitest';

vi.mock('@cli/commands/schedule/ScheduleCliSupport', () => ({
  ScheduleCliSupport: {
    registerAll: vi.fn(async () => undefined),
    shutdownCliResources: vi.fn(async () => undefined),
  },
}));

vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    list: () => [],
    start: vi.fn(),
    stop: vi.fn(async () => undefined),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/env', () => ({
  Env: {
    getBool: () => true,
    getInt: (_k: string, d: number) => d,
  },
}));

import { ScheduleStartCommand } from '@cli/commands/ScheduleStartCommand';

describe('ScheduleStartCommand (coverage extras)', () => {
  it('throws when process.once is unavailable', async () => {
    const originalOnce = (process as any).once;
    (process as any).once = undefined;

    const cmd = ScheduleStartCommand.create();
    await expect(cmd.execute({ args: [] })).rejects.toBeDefined();

    (process as any).once = originalOnce;
  });
});
