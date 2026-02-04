/**
 * CLI Module Index
 * Exports all CLI components
 */

export { BaseCommand, type CommandOptions } from '@cli/BaseCommand';
export { CLI } from '@cli/CLI';
export { ErrorHandler, EXIT_CODES } from '@cli/ErrorHandler';
export { PromptHelper, type PromptOptions } from '@cli/PromptHelper';

// Export commands
export { AddCommand } from '@cli/commands/AddCommand';
export { ConfigCommand } from '@cli/commands/ConfigCommand';
export { DebugCommand } from '@cli/commands/DebugCommand';
export { MigrateCommand } from '@cli/commands/MigrateCommand';
export { MySqlProxyCommand } from '@cli/commands/MySqlProxyCommand';
export { NewCommand } from '@cli/commands/NewCommand';
export { PostgresProxyCommand } from '@cli/commands/PostgresProxyCommand';
export { ProxyCommand } from '@cli/commands/ProxyCommand';
export { RedisProxyCommand } from '@cli/commands/RedisProxyCommand';
export { SecretsCommand } from '@cli/commands/SecretsCommand';
