/**
 * Checkpoint Manager
 * File-based persistent state tracking for resumable operations
 */

import { ErrorFactory } from '@zintrust/core/errors';
import { Logger } from '@zintrust/core/logger';
import { NodeSingletons } from '@zintrust/core/workers';
import type { CheckpointData, MigrationError, MigrationState } from '../types';

const MIGRATION_DIR = '.zintrust/migration';

const path = NodeSingletons.path;
const { fsPromises, mkdir, readFile, rm, writeFile } = NodeSingletons.fs;
/**
 * CheckpointManager - Sealed namespace for migration state management
 * Provides file-based persistent storage for migration progress
 */
export const CheckpointManager = Object.freeze({
  /**
   * Initialize migration directory
   */
  async initDirectory(): Promise<void> {
    try {
      await mkdir(MIGRATION_DIR, { recursive: true });
    } catch (initError) {
      Logger.error('Failed to create migration directory:', initError);
      throw ErrorFactory.createConfigError('Cannot create migration directory');
    }
  },

  /**
   * Save migration state to file
   */
  async saveState(state: MigrationState): Promise<void> {
    await CheckpointManager.initDirectory();

    const filePath = path.join(MIGRATION_DIR, `migration-${state.id}.json`);
    const content = JSON.stringify(state, null, 2);

    try {
      await writeFile(filePath, content, 'utf-8');
      Logger.info(`Migration state saved: ${filePath}`);
    } catch (writeError) {
      Logger.error('Failed to save migration state:', writeError);
      throw ErrorFactory.createConfigError('Cannot save migration state');
    }
  },

  /**
   * Load migration state from file
   */
  async loadState(migrationId: string): Promise<MigrationState | null> {
    const filePath = NodeSingletons.path.join(MIGRATION_DIR, `migration-${migrationId}.json`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const state = JSON.parse(content) as MigrationState;

      // Convert date strings back to Date objects
      state.startTime = new Date(state.startTime);
      if (state.lastCheckpoint) {
        state.lastCheckpoint = new Date(state.lastCheckpoint);
      }

      return state;
    } catch {
      Logger.warn(`Migration state not found: ${filePath}`);
      return null;
    }
  },

  /**
   * Save checkpoint data
   */
  async saveCheckpoint(checkpoint: CheckpointData): Promise<void> {
    await CheckpointManager.initDirectory();

    const filePath = path.join(
      MIGRATION_DIR,
      `checkpoint-${checkpoint.migrationId}-${checkpoint.table}.json`
    );
    const content = JSON.stringify(checkpoint, null, 2);

    try {
      await writeFile(filePath, content, 'utf-8');
      Logger.debug(`Checkpoint saved: ${filePath}`);
    } catch (writeError) {
      Logger.error('Failed to save checkpoint:', writeError);
      throw ErrorFactory.createConfigError('Cannot save checkpoint');
    }
  },

  /**
   * Load checkpoint data
   */
  async loadCheckpoint(migrationId: string, table: string): Promise<CheckpointData | null> {
    const filePath = path.join(MIGRATION_DIR, `checkpoint-${migrationId}-${table}.json`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const checkpoint = JSON.parse(content) as CheckpointData;
      checkpoint.timestamp = new Date(checkpoint.timestamp);
      return checkpoint;
    } catch {
      Logger.debug(`Checkpoint not found: ${filePath}`);
      return null;
    }
  },

  /**
   * Get all checkpoints for a migration
   */
  async getAllCheckpoints(migrationId: string): Promise<CheckpointData[]> {
    await CheckpointManager.initDirectory();

    try {
      const files = await fsPromises.readdir(MIGRATION_DIR);
      const checkpointFiles = files.filter(
        (file: string) => file.startsWith(`checkpoint-${migrationId}-`) && file.endsWith('.json')
      );

      const checkpoints: CheckpointData[] = [];

      // Process files in parallel for better performance
      const checkpointPromises = checkpointFiles.map(async (file: string) => {
        try {
          const filePath = path.join(MIGRATION_DIR, file);
          const content = await readFile(filePath, 'utf-8');
          const checkpoint = JSON.parse(content) as CheckpointData;
          checkpoint.timestamp = new Date(checkpoint.timestamp);
          return checkpoint;
        } catch (parseError) {
          Logger.warn(`Failed to load checkpoint file ${file}:`, parseError);
          return null;
        }
      });

      const results = await Promise.allSettled(checkpointPromises);
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value !== null) {
          checkpoints.push(result.value);
        }
      });

      return checkpoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (readError) {
      Logger.error('Failed to list checkpoints:', readError);
      return [];
    }
  },

  /**
   * Clean up migration files
   */
  async cleanup(migrationId: string): Promise<void> {
    try {
      const files = await fsPromises.readdir(MIGRATION_DIR);
      const migrationFiles = files.filter(
        (file: string) => file.includes(migrationId) && file.endsWith('.json')
      );

      // Process cleanup in parallel
      const cleanupPromises = migrationFiles.map(async (file: string) => {
        try {
          const filePath = path.join(MIGRATION_DIR, file);
          await rm(filePath);
          Logger.debug(`Cleaned up migration file: ${file}`);
        } catch (cleanupError) {
          Logger.warn(`Failed to cleanup file ${file}:`, cleanupError);
        }
      });

      await Promise.allSettled(cleanupPromises);
    } catch (readError) {
      Logger.error('Failed to cleanup migration files:', readError);
    }
  },

  /**
   * List all migrations
   */
  async listMigrations(): Promise<string[]> {
    try {
      const files = await fsPromises.readdir(MIGRATION_DIR);
      const migrationFiles = files.filter(
        (file: string) => file.startsWith('migration-') && file.endsWith('.json')
      );

      return migrationFiles.map((file: string) =>
        file.replace('migration-', '').replace('.json', '')
      );
    } catch (readError) {
      Logger.error('Failed to list migrations:', readError);
      return [];
    }
  },

  /**
   * Log migration error
   */
  async logError(migrationId: string, errorData: MigrationError): Promise<void> {
    await CheckpointManager.initDirectory();

    const filePath = path.join(MIGRATION_DIR, `errors-${migrationId}.json`);

    try {
      let errors: MigrationError[] = [];

      try {
        const content = await readFile(filePath, 'utf-8');
        errors = JSON.parse(content) as MigrationError[];
      } catch {
        // File doesn't exist, start with empty array
      }

      errors.push(errorData);

      await writeFile(filePath, JSON.stringify(errors, null, 2), 'utf-8');
      Logger.error(`Migration error logged: ${errorData.error}`);
    } catch (writeError) {
      Logger.error('Failed to log migration error:', writeError);
    }
  },
});
