// CLI utilities (for build tools and scripting)
export { BaseCommand } from '@cli/BaseCommand';
export type { CommandOptions } from '@cli/BaseCommand';
export { CLI } from '@cli/CLI';
export { ErrorHandler, EXIT_CODES } from '@cli/ErrorHandler';

export { TraceCommands } from '@cli/commands/TraceCommands';
export { WorkerCommands } from '@cli/commands/WorkerCommands';
export { OptionalCliCommandRegistry } from '@cli/OptionalCliCommandRegistry';
export type { CliCommandProvider } from '@cli/OptionalCliCommandRegistry';
