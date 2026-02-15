import type { Blueprint, IDatabase } from '@zintrust/core';
import { MigrationSchema } from '@zintrust/core';

type HasIndexFn = (tableName: string, indexName: string) => Promise<boolean>;

const createHasIndex = (db: IDatabase): HasIndexFn => {
  return async (tableName: string, indexName: string): Promise<boolean> => {
    const t = db.getType();

    if (t === 'mysql') {
      const rows = await db.query(
        'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name=? AND index_name=? LIMIT 1',
        [tableName, indexName],
        true
      );
      return rows.length > 0;
    }

    if (t === 'postgresql') {
      const rows = await db.query(
        "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=? AND indexname=? LIMIT 1",
        [tableName, indexName],
        true
      );
      return rows.length > 0;
    }

    if (t === 'sqlite' || t === 'd1' || t === 'd1-remote') {
      const rows = await db.query(`PRAGMA index_list("${tableName}")`, [], true);
      return rows.some((row) => (row as { name?: unknown }).name === indexName);
    }

    if (t === 'sqlserver') {
      const rows = await db.query(
        'SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(?) AND name=?',
        [tableName, indexName],
        true
      );
      return rows.length > 0;
    }

    return false;
  };
};

const expandJobsTableIfNeeded = async (
  db: IDatabase,
  schema: ReturnType<typeof MigrationSchema.create>
): Promise<void> => {
  const jobsTableExists = await schema.hasTable('zintrust_jobs');
  if (!jobsTableExists) return;

  const hasIndex = createHasIndex(db);

  const [
    hasLastErrorCode,
    hasTimeoutAt,
    hasHeartbeatAt,
    hasExpectedCompletionAt,
    hasWorkerName,
    hasWorkerInstanceId,
    hasWorkerRegion,
    hasWorkerVersion,
    hasRecoveredAt,
    hasIdempotencyKey,
  ] = await Promise.all([
    schema.hasColumn('zintrust_jobs', 'last_error_code'),
    schema.hasColumn('zintrust_jobs', 'timeout_at'),
    schema.hasColumn('zintrust_jobs', 'heartbeat_at'),
    schema.hasColumn('zintrust_jobs', 'expected_completion_at'),
    schema.hasColumn('zintrust_jobs', 'worker_name'),
    schema.hasColumn('zintrust_jobs', 'worker_instance_id'),
    schema.hasColumn('zintrust_jobs', 'worker_region'),
    schema.hasColumn('zintrust_jobs', 'worker_version'),
    schema.hasColumn('zintrust_jobs', 'recovered_at'),
    schema.hasColumn('zintrust_jobs', 'idempotency_key'),
  ]);

  const [hasIdxStatusUpdated, hasIdxExpectedCompletion, hasIdxHeartbeat, hasIdxIdempotency] =
    await Promise.all([
      hasIndex('zintrust_jobs', 'idx_zj_status_updated'),
      hasIndex('zintrust_jobs', 'idx_zj_expected_completion'),
      hasIndex('zintrust_jobs', 'idx_zj_heartbeat_at'),
      hasIndex('zintrust_jobs', 'idx_zj_idempotency'),
    ]);

  await schema.table('zintrust_jobs', (table: Blueprint) => {
    if (!hasLastErrorCode) table.string('last_error_code').nullable();
    if (!hasTimeoutAt) table.timestamp('timeout_at').nullable();
    if (!hasHeartbeatAt) table.timestamp('heartbeat_at').nullable();
    if (!hasExpectedCompletionAt) table.timestamp('expected_completion_at').nullable();
    if (!hasWorkerName) table.string('worker_name').nullable();
    if (!hasWorkerInstanceId) table.string('worker_instance_id').nullable();
    if (!hasWorkerRegion) table.string('worker_region').nullable();
    if (!hasWorkerVersion) table.string('worker_version').nullable();
    if (!hasRecoveredAt) table.timestamp('recovered_at').nullable();
    if (!hasIdempotencyKey) table.string('idempotency_key').nullable();

    if (!hasIdxStatusUpdated) table.index(['status', 'updated_at'], 'idx_zj_status_updated');
    if (!hasIdxExpectedCompletion) {
      table.index('expected_completion_at', 'idx_zj_expected_completion');
    }
    if (!hasIdxHeartbeat) table.index('heartbeat_at', 'idx_zj_heartbeat_at');
    if (!hasIdxIdempotency) table.index('idempotency_key', 'idx_zj_idempotency');
  });
};

const ensureHeartbeatsTable = async (
  schema: ReturnType<typeof MigrationSchema.create>
): Promise<void> => {
  await schema.create('zintrust_job_heartbeats', (table: Blueprint) => {
    table.id();
    table.string('job_id');
    table.string('queue_name');
    table.string('worker_instance_id').nullable();
    table.timestamp('last_heartbeat_at').nullable();
    table.timestamp('expected_next_heartbeat_at').nullable();
    table.integer('heartbeat_interval_ms').default(10000);
    table.timestamp('created_at').nullable();
    table.timestamp('updated_at').nullable();

    table.index(['queue_name', 'expected_next_heartbeat_at'], 'idx_zjh_qn_next_hb');
    table.index(['job_id', 'queue_name'], 'idx_zjh_job_queue');
  });
};

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await expandJobsTableIfNeeded(db, schema);
    await ensureHeartbeatsTable(schema);
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('zintrust_job_heartbeats');
  },
};
