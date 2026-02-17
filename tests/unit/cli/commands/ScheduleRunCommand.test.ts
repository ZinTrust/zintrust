import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  registerAll: vi.fn(async () => undefined),
  shutdown: vi.fn(async () => undefined),
  runOnce: vi.fn(async () => undefined),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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
    runOnce: (...args: any[]) => mocked.runOnce(...args),
  },
}));

describe('ScheduleRunCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('throws when --name is missing', async () => {
    const { ScheduleRunCommand } = await import('@cli/commands/ScheduleRunCommand');
    await expect(ScheduleRunCommand.create().execute({ name: '  ' } as any)).rejects.toThrow(
      /--name is required/i
    );
  });

  it('runs a schedule and always shuts down', async () => {
    mocked.runOnce.mockRejectedValueOnce(new Error('boom'));

    const { ScheduleRunCommand } = await import('@cli/commands/ScheduleRunCommand');
    await expect(ScheduleRunCommand.create().execute({ name: 'a' } as any)).rejects.toThrow('boom');
    expect(mocked.shutdown).toHaveBeenCalledTimes(1);
  });
});
