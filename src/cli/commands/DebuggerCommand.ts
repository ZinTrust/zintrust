import { DebuggerCommands } from '@cli/commands/DebuggerCommands';

export { DebuggerCommands } from '@cli/commands/DebuggerCommands';

export const DebuggerPruneCommand = DebuggerCommands.createDebuggerPruneProvider();

export const DebuggerClearCommand = DebuggerCommands.createDebuggerClearProvider();

export const DebuggerStatusCommand = DebuggerCommands.createDebuggerStatusProvider();

export const DebuggerMigrateCommand = DebuggerCommands.createDebuggerMigrateProvider();
