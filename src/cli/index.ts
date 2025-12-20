/**
 * CLI Module Index
 * Exports all CLI components
 */

export { BaseCommand, type CommandOptions } from '@cli/BaseCommand';
export { CLI } from '@cli/CLI';
export { EXIT_CODES, ErrorHandler } from '@cli/ErrorHandler';
export { PromptHelper, type PromptOptions } from '@cli/PromptHelper';

// Export commands
export { AddCommand } from '@cli/commands/AddCommand';
export { ConfigCommand } from '@cli/commands/ConfigCommand';
export { DebugCommand } from '@cli/commands/DebugCommand';
export { MigrateCommand } from '@cli/commands/MigrateCommand';
export { NewCommand } from '@cli/commands/NewCommand';
