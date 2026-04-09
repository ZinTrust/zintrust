import { TraceCommands } from '@cli/commands/TraceCommands';

export { TraceCommands } from '@cli/commands/TraceCommands';

export const TracePruneCommand = TraceCommands.createTracePruneProvider();

export const TraceClearCommand = TraceCommands.createTraceClearProvider();

export const TraceStatusCommand = TraceCommands.createTraceStatusProvider();

export const TraceMigrateCommand = TraceCommands.createTraceMigrateProvider();
