export const cloudflareQueueMigrationStatements = Object.freeze([
  `CREATE TABLE IF NOT EXISTS cf_queue_jobs (
    id TEXT PRIMARY KEY,
    queue_name TEXT NOT NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    opts TEXT,
    state TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 1,
    progress TEXT,
    result TEXT,
    error TEXT,
    dedupe_key TEXT,
    idempotency_key TEXT,
    available_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    failed_at TEXT,
    stalled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_jobs_queue_state_priority_available_at
    ON cf_queue_jobs(queue_name, state, priority, available_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_jobs_queue_dedupe_key
    ON cf_queue_jobs(queue_name, dedupe_key)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_jobs_queue_idempotency_key
    ON cf_queue_jobs(queue_name, idempotency_key)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_jobs_queue_updated_at
    ON cf_queue_jobs(queue_name, updated_at)`,
  `CREATE TABLE IF NOT EXISTS cf_queue_job_events (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    event TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_job_events_job_queue
    ON cf_queue_job_events(job_id, queue_name)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_job_events_queue_event_created_at
    ON cf_queue_job_events(queue_name, event, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_job_events_created_at
    ON cf_queue_job_events(created_at)`,
  `CREATE TABLE IF NOT EXISTS cf_queue_job_logs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_job_logs_job_queue
    ON cf_queue_job_logs(job_id, queue_name)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_job_logs_queue_level_created_at
    ON cf_queue_job_logs(queue_name, level, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_job_logs_created_at
    ON cf_queue_job_logs(created_at)`,
  `CREATE TABLE IF NOT EXISTS cf_queue_repeatables (
    id TEXT PRIMARY KEY,
    queue_name TEXT NOT NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    cron TEXT,
    every_ms INTEGER,
    start_at TEXT,
    end_at TEXT,
    limit_count INTEGER,
    run_count INTEGER NOT NULL DEFAULT 0,
    next_run_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_repeatables_active_next_run_at
    ON cf_queue_repeatables(active, next_run_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_repeatables_queue_active
    ON cf_queue_repeatables(queue_name, active)`,
  `CREATE TABLE IF NOT EXISTS cf_queue_flow_dependencies (
    id TEXT PRIMARY KEY,
    queue_name TEXT NOT NULL,
    parent_job_id TEXT NOT NULL,
    child_job_id TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_flow_dependencies_queue_parent
    ON cf_queue_flow_dependencies(queue_name, parent_job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_flow_dependencies_queue_child
    ON cf_queue_flow_dependencies(queue_name, child_job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cf_queue_flow_dependencies_queue_state
    ON cf_queue_flow_dependencies(queue_name, state)`,
]);

export const cloudflareQueueRollbackStatements = Object.freeze([
  'DROP TABLE IF EXISTS cf_queue_flow_dependencies',
  'DROP TABLE IF EXISTS cf_queue_repeatables',
  'DROP TABLE IF EXISTS cf_queue_job_logs',
  'DROP TABLE IF EXISTS cf_queue_job_events',
  'DROP TABLE IF EXISTS cf_queue_jobs',
]);
