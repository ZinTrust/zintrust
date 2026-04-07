import { afterEach, describe, expect, it, vi } from 'vitest';

const pruneProvider = Object.freeze({ name: 'prune-provider' });
const clearProvider = Object.freeze({ name: 'clear-provider' });
const statusProvider = Object.freeze({ name: 'status-provider' });
const migrateProvider = Object.freeze({ name: 'migrate-provider' });

const createTracePruneProvider = vi.fn(() => pruneProvider);
const createTraceClearProvider = vi.fn(() => clearProvider);
const createTraceStatusProvider = vi.fn(() => statusProvider);
const createTraceMigrateProvider = vi.fn(() => migrateProvider);

vi.mock('@cli/commands/TraceCommands', () => ({
  TraceCommands: {
    createTracePruneProvider,
    createTraceClearProvider,
    createTraceStatusProvider,
    createTraceMigrateProvider,
  },
}));

describe('TraceCommand exports', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates provider exports from TraceCommands exactly once at module load', async () => {
    const commandModule = await import('@cli/commands/TraceCommand');

    expect(commandModule.TraceCommands).toBeDefined();
    expect(commandModule.TracePruneCommand).toBe(pruneProvider);
    expect(commandModule.TraceClearCommand).toBe(clearProvider);
    expect(commandModule.TraceStatusCommand).toBe(statusProvider);
    expect(commandModule.TraceMigrateCommand).toBe(migrateProvider);

    expect(createTracePruneProvider).toHaveBeenCalledTimes(1);
    expect(createTraceClearProvider).toHaveBeenCalledTimes(1);
    expect(createTraceStatusProvider).toHaveBeenCalledTimes(1);
    expect(createTraceMigrateProvider).toHaveBeenCalledTimes(1);
  });
});
