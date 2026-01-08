import type { IDatabase } from '@orm/Database';

export type MigrationScope = 'global' | 'service';

export type MigrationRecordStatus = 'running' | 'completed' | 'failed';

export type MigrationRecord = {
  name: string;
  scope: MigrationScope;
  service: string;
  batch: number;
  status: MigrationRecordStatus;
  appliedAt: string | null;
};

export type MigrationModule = {
  migration?: {
    up?: unknown;
    down?: unknown;
  };
  up?: unknown;
  down?: unknown;
};

export type MigrationHandler = (db: IDatabase) => Promise<void>;

export type LoadedMigration = {
  name: string;
  filePath: string;
  up: MigrationHandler;
  down: MigrationHandler;
};

export type MigratorStatusRow = {
  name: string;
  applied: boolean;
  batch: number | null;
  status: string | null;
  appliedAt: string | null;
};

export type MigratorOptions = {
  db: IDatabase;
  projectRoot: string;
  globalDir: string;
  extension: string;
  lockFile?: string;
  separateTracking?: boolean;
  scope?: MigrationScope;
  service?: string;
  includeGlobal?: boolean;
};
