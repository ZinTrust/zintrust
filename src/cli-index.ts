/**
 * ZinTrust CLI Utilities - Non-runtime entrypoint
 * Contains CLI tools and commands for development/admin use
 */

// CLI utilities (for build tools and scripting)
export { BaseCommand } from '@cli/BaseCommand';
export type { CommandOptions } from '@cli/BaseCommand';
export { CLI } from '@cli/CLI';
export { EXIT_CODES, ErrorHandler } from '@cli/ErrorHandler';

export { TraceCommands } from '@cli/commands/TraceCommands';
export { WorkerCommands } from '@cli/commands/WorkerCommands';
export { OptionalCliCommandRegistry } from '@cli/OptionalCliCommandRegistry';
export type { CliCommandProvider } from '@cli/OptionalCliCommandRegistry';

// D1 utilities
export { LocalD1Resolver } from '@cli/d1/LocalD1Resolver';
export { WranglerConfig } from '@cli/d1/WranglerConfig';
export { WranglerD1 } from '@cli/d1/WranglerD1';
