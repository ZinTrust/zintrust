/**
 * Debugger CLI Commands
 * Provides `zin debugger:prune` and `zin debugger:clear` for @zintrust/system-debugger.
 * The system-debugger package is optional — it is loaded dynamically at runtime.
 */

import { BaseCommand, type CommandOptions } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

// ---------------------------------------------------------------------------
// Local type stubs (avoid static import from optional package)
// ---------------------------------------------------------------------------

type DebuggerStorageApi = {
  prune(olderThanMs: number, keepExceptions?: boolean): Promise<number>;
  clear(): Promise<void>;
};

type DebuggerConfigApi = {
  merge(override?: unknown): { pruneAfterHours: number; connection?: string };
};

type DebuggerStorageModule = {
  DebuggerStorage: {
    resolveStorage(db: unknown): DebuggerStorageApi;
  };
  DebuggerConfig: DebuggerConfigApi;
};

// ---------------------------------------------------------------------------
// Lazy loader
// ---------------------------------------------------------------------------

const loadDebuggerModule = async (): Promise<DebuggerStorageModule> => {
  try {
    return (await import('@zintrust/system-debugger')) as unknown as DebuggerStorageModule;
  } catch (error) {
    Logger.error('Failed to load optional package "@zintrust/system-debugger"', error);
    throw ErrorFactory.createCliError(
      'Package "@zintrust/system-debugger" is not installed. Add it to your project first.'
    );
  }
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const addPruneOptions = (command: Command): void => {
  command
    .option('--hours <number>', 'Remove entries older than N hours (default: from config)', '')
    .option('--keep-exceptions', 'Keep exception entries regardless of age', false);
};

const executePrune = async (options: CommandOptions): Promise<void> => {
  const { useDatabase } = await import('@zintrust/core');
  const { DebuggerConfig, DebuggerStorage } = await loadDebuggerModule();

  const config = DebuggerConfig.merge();
  const hours =
    typeof options['hours'] === 'string' && options['hours'] !== ''
      ? Number.parseInt(options['hours'], 10)
      : config.pruneAfterHours;

  const db = useDatabase(undefined, config.connection ?? 'default');
  const storage = DebuggerStorage.resolveStorage(db);

  const olderThanMs = hours * 60 * 60 * 1000;
  const keepExceptions = options['keepExceptions'] === true;

  Logger.info(`Pruning debugger entries older than ${hours}h...`);
  const deleted = await storage.prune(olderThanMs, keepExceptions);
  Logger.info(`Done — removed ${deleted} entries.`);
};

const executeClear = async (_options: CommandOptions): Promise<void> => {
  const { useDatabase } = await import('@zintrust/core');
  const { DebuggerConfig, DebuggerStorage } = await loadDebuggerModule();

  const config = DebuggerConfig.merge();
  const db = useDatabase(undefined, config.connection ?? 'default');
  const storage = DebuggerStorage.resolveStorage(db);

  Logger.info('Clearing all debugger entries...');
  await storage.clear();
  Logger.info('Done — all entries cleared.');
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const DebuggerPruneCommand = BaseCommand.create({
  name: 'debugger:prune',
  description: 'Prune old entries from the debugger storage',
  addOptions: addPruneOptions,
  execute: executePrune,
});

export const DebuggerClearCommand = BaseCommand.create({
  name: 'debugger:clear',
  description: 'Clear all entries from the debugger storage',
  execute: executeClear,
});
