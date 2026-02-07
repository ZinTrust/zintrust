/**
 * Migration: Add processor_spec and active_status to zintrust_workers
 */
import { MigrationSchema, type Blueprint, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    const hasProcessorSpec = await schema.hasColumn('zintrust_workers', 'processor_spec');
    if (!hasProcessorSpec) {
      await schema.table('zintrust_workers', (table: Blueprint) => {
        table.string('processor_spec').nullable();
      });
    }

    const hasActiveStatus = await schema.hasColumn('zintrust_workers', 'active_status');
    if (!hasActiveStatus) {
      await schema.table('zintrust_workers', (table: Blueprint) => {
        table.boolean('active_status').default(true);
      });
    }

    if (!hasProcessorSpec) {
      await db
        .table('zintrust_workers')
        .whereNull('processor_spec')
        .update({ processor_spec: db.raw('processor_path') });
    }

    try {
      await schema.table('zintrust_workers', (table: Blueprint) => {
        table.index(['active_status'], 'idx_zintrust_workers_active_status');
      });
    } catch {
      // Best-effort: index may already exist in some databases.
    }
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    try {
      await schema.table('zintrust_workers', (table: Blueprint) => {
        table.dropIndex('idx_zintrust_workers_active_status');
      });
    } catch {
      // Best-effort: index may not exist on all databases.
    }

    const hasProcessorSpec = await schema.hasColumn('zintrust_workers', 'processor_spec');
    if (hasProcessorSpec) {
      await schema.table('zintrust_workers', (table: Blueprint) => {
        table.dropColumn('processor_spec');
      });
    }

    const hasActiveStatus = await schema.hasColumn('zintrust_workers', 'active_status');
    if (hasActiveStatus) {
      await schema.table('zintrust_workers', (table: Blueprint) => {
        table.dropColumn('active_status');
      });
    }
  },
};
