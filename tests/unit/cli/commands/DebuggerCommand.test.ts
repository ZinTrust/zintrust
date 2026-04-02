import { afterEach, describe, expect, it, vi } from 'vitest';

const pruneProvider = Object.freeze({ name: 'prune-provider' });
const clearProvider = Object.freeze({ name: 'clear-provider' });
const statusProvider = Object.freeze({ name: 'status-provider' });
const migrateProvider = Object.freeze({ name: 'migrate-provider' });

const createDebuggerPruneProvider = vi.fn(() => pruneProvider);
const createDebuggerClearProvider = vi.fn(() => clearProvider);
const createDebuggerStatusProvider = vi.fn(() => statusProvider);
const createDebuggerMigrateProvider = vi.fn(() => migrateProvider);

vi.mock('@cli/commands/DebuggerCommands', () => ({
  DebuggerCommands: {
    createDebuggerPruneProvider,
    createDebuggerClearProvider,
    createDebuggerStatusProvider,
    createDebuggerMigrateProvider,
  },
}));

describe('DebuggerCommand exports', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('creates provider exports from DebuggerCommands exactly once at module load', async () => {
    const commandModule = await import('@cli/commands/DebuggerCommand');

    expect(commandModule.DebuggerCommands).toBeDefined();
    expect(commandModule.DebuggerPruneCommand).toBe(pruneProvider);
    expect(commandModule.DebuggerClearCommand).toBe(clearProvider);
    expect(commandModule.DebuggerStatusCommand).toBe(statusProvider);
    expect(commandModule.DebuggerMigrateCommand).toBe(migrateProvider);

    expect(createDebuggerPruneProvider).toHaveBeenCalledTimes(1);
    expect(createDebuggerClearProvider).toHaveBeenCalledTimes(1);
    expect(createDebuggerStatusProvider).toHaveBeenCalledTimes(1);
    expect(createDebuggerMigrateProvider).toHaveBeenCalledTimes(1);
  });
});
