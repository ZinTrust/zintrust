import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  registerAll: vi.fn(async () => undefined),
  shutdown: vi.fn(async () => undefined),
  listWithState: vi.fn(async () => []),
}));

vi.mock('@config/logger', () => ({ Logger: mocked.logger }));
vi.mock('@cli/commands/schedule/ScheduleCliSupport', () => ({
  ScheduleCliSupport: {
    registerAll: (...args: any[]) => mocked.registerAll(...args),
    shutdownCliResources: (...args: any[]) => mocked.shutdown(...args),
  },
}));
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    listWithState: (...args: any[]) => mocked.listWithState(...args),
  },
}));

describe('ScheduleListCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints JSON rows when --json is used', async () => {
    mocked.listWithState.mockResolvedValueOnce([
      {
        schedule: {
          name: 'a',
          cron: '*/5 * * * *',
          timezone: 'UTC',
          enabled: true,
          runOnStart: true,
        } as any,
        state: {
          lastRunAt: Date.parse('2026-01-01T00:00:00.000Z'),
          nextRunAt: Date.parse('2026-01-01T00:05:00.000Z'),
        } as any,
      },
    ]);

    const { ScheduleListCommand } = await import('@cli/commands/ScheduleListCommand');
    await ScheduleListCommand.create().execute({ json: true });

    expect(mocked.registerAll).toHaveBeenCalledTimes(1);
    expect(mocked.logger.info).toHaveBeenCalledWith(expect.stringContaining('"name": "a"'));
    expect(mocked.shutdown).toHaveBeenCalledTimes(1);
  });

  it('prints a friendly message when there are no schedules', async () => {
    mocked.listWithState.mockResolvedValueOnce([]);
    const { ScheduleListCommand } = await import('@cli/commands/ScheduleListCommand');
    await ScheduleListCommand.create().execute({});
    expect(mocked.logger.info).toHaveBeenCalledWith('No schedules registered');
    expect(mocked.shutdown).toHaveBeenCalledTimes(1);
  });

  it('prints human-readable rows with interval cadence and extra state info', async () => {
    mocked.listWithState.mockResolvedValueOnce([
      {
        schedule: { name: 'b', intervalMs: 60000, enabled: false, runOnStart: false } as any,
        state: { lastSuccessAt: Date.parse('2026-01-01T00:00:00.000Z') } as any,
      },
      {
        schedule: { name: 'c', intervalMs: undefined, enabled: true, runOnStart: false } as any,
        state: null,
      },
    ]);

    const { ScheduleListCommand } = await import('@cli/commands/ScheduleListCommand');
    await ScheduleListCommand.create().execute({});

    const joined = mocked.logger.info.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(joined).toContain('b (enabled=false');
    expect(joined).toContain('intervalMs=60000');
    expect(joined).toContain('lastOk=2026-01-01T00:00:00.000Z');
    expect(joined).toContain('c (enabled=true');
    expect(joined).toContain('intervalMs=manual');
  });
});
