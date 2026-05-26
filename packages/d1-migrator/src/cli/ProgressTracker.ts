/**
 * Progress Tracker
 * Tracks migration progress and provides status updates
 */

import { Logger } from '@zintrust/core/logger';
import type { MigrationProgress } from '../types';

/**
 * ProgressTracker - Sealed namespace for progress tracking
 * Provides migration progress monitoring and reporting
 */
export const ProgressTracker = Object.freeze({
  /**
   * Create new progress tracker
   */
  create(migrationId: string): MigrationProgress {
    return {
      migrationId,
      startTime: new Date(),
      currentTable: '',
      table: '',
      totalTables: 0,
      totalRows: 0,
      processedRows: 0,
      percentage: 0,
      errors: {},
      status: 'pending',
    };
  },

  /**
   * Update progress
   */
  update(progress: MigrationProgress, updates: Partial<MigrationProgress>): MigrationProgress {
    const updated = { ...progress, ...updates };

    // Log progress updates
    if (updates.currentTable && updates.currentTable !== progress.currentTable) {
      Logger.info(`Migrating table: ${updates.currentTable}`);
    }

    if (updates.processedRows !== undefined) {
      const percentage =
        progress.totalRows > 0 ? Math.round((updates.processedRows / progress.totalRows) * 100) : 0;
      Logger.info(`Progress: ${updates.processedRows}/${progress.totalRows} (${percentage}%)`);
    }

    return updated;
  },

  /**
   * Add error to progress
   */
  addError(progress: MigrationProgress, table: string, error: string): MigrationProgress {
    const updated = {
      ...progress,
      errors: {
        ...progress.errors,
        [table]: error,
      },
      status: 'failed' as const,
    };

    Logger.error(`Migration error for table ${table}: ${error}`);
    return updated;
  },

  /**
   * Mark as completed
   */
  complete(progress: MigrationProgress): MigrationProgress {
    const completed = {
      ...progress,
      status: 'completed' as const,
    };

    Logger.info(`Migration completed: ${progress.migrationId}`);
    return completed;
  },

  /**
   * Generate progress report
   */
  generateReport(progress: MigrationProgress): string {
    const startTime = progress.startTime || new Date();
    const duration = Date.now() - startTime.getTime();
    const durationMinutes = Math.round(duration / 60000);

    let report = '# Migration Progress Report\n\n';
    report += `## Migration ID: ${progress.migrationId}\n`;
    report += `## Status: ${progress.status}\n`;
    report += `## Duration: ${durationMinutes} minutes\n\n`;

    report += `## Tables\n`;
    report += `- Completed: ${progress.processedRows}/${progress.totalRows}\n`;
    report += `- Current: ${progress.currentTable || 'None'}\n\n`;

    report += `## Rows\n`;
    report += `- Migrated: ${progress.processedRows}/${progress.totalRows}\n`;
    const percentage =
      progress.totalRows > 0 ? Math.round((progress.processedRows / progress.totalRows) * 100) : 0;
    report += `- Progress: ${percentage}%\n\n`;

    if (progress.errors && Object.keys(progress.errors).length > 0) {
      report += `## Errors\n`;
      Object.values(progress.errors).forEach((error: string, index) => {
        report += `${index + 1}. ${error}\n`;
      });
    }

    return report;
  },
});
