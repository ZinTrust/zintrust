-- Generated from 20260213142000_create_zintrust_job_tracking_tables
CREATE TABLE IF NOT EXISTS "zintrust_jobs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "job_id" TEXT NOT NULL,
  "queue_name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER,
  "payload_json" TEXT,
  "result_json" TEXT,
  "last_error" TEXT,
  "retry_at" TEXT,
  "created_at" TEXT,
  "started_at" TEXT,
  "completed_at" TEXT,
  "updated_at" TEXT
);
CREATE INDEX "idx_zintrust_jobs_job_id_queue_name" ON "zintrust_jobs" ("job_id", "queue_name");
CREATE INDEX "idx_zintrust_jobs_queue_name_status" ON "zintrust_jobs" ("queue_name", "status");
CREATE INDEX "idx_zintrust_jobs_updated_at" ON "zintrust_jobs" ("updated_at");
CREATE TABLE IF NOT EXISTS "zintrust_job_transitions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "job_id" TEXT NOT NULL,
  "queue_name" TEXT NOT NULL,
  "from_status" TEXT,
  "to_status" TEXT NOT NULL,
  "reason" TEXT,
  "attempts" INTEGER,
  "error" TEXT,
  "transitioned_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "idx_zintrust_job_transitions_job_id_queue_name" ON "zintrust_job_transitions" ("job_id", "queue_name");
CREATE INDEX "idx_zintrust_job_transitions_transitioned_at" ON "zintrust_job_transitions" ("transitioned_at");
