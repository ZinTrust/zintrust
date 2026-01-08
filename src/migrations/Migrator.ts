import { MigratorFactory } from '@/migrations/MigratorFactory';

export type {
  LoadedMigration,
  MigrationHandler,
  MigrationModule,
  MigrationRecord,
  MigrationRecordStatus,
  MigrationScope,
  MigratorOptions,
  MigratorStatusRow,
} from '@/migrations/types';

export const Migrator = Object.freeze({
  create: MigratorFactory.create,
});
