-- Generated from 20260213183000_expand_zintrust_job_tracking_reliability_tables
ALTER TABLE "zintrust_jobs" ADD COLUMN "last_error_code" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "timeout_at" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "heartbeat_at" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "expected_completion_at" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "worker_name" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "worker_instance_id" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "worker_region" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "worker_version" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "recovered_at" TEXT;
ALTER TABLE "zintrust_jobs" ADD COLUMN "idempotency_key" TEXT;
CREATE INDEX "idx_zj_status_updated" ON "zintrust_jobs" ("status", "updated_at");
CREATE INDEX "idx_zj_expected_completion" ON "zintrust_jobs" ("expected_completion_at");
CREATE INDEX "idx_zj_heartbeat_at" ON "zintrust_jobs" ("heartbeat_at");
CREATE INDEX "idx_zj_idempotency" ON "zintrust_jobs" ("idempotency_key");
CREATE TABLE IF NOT EXISTS "zintrust_job_heartbeats" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "job_id" TEXT NOT NULL,
  "queue_name" TEXT NOT NULL,
  "worker_instance_id" TEXT,
  "last_heartbeat_at" TEXT,
  "expected_next_heartbeat_at" TEXT,
  "heartbeat_interval_ms" INTEGER NOT NULL DEFAULT 10000,
  "created_at" TEXT,
  "updated_at" TEXT
);
CREATE INDEX "idx_zjh_qn_next_hb" ON "zintrust_job_heartbeats" ("queue_name", "expected_next_heartbeat_at");
CREATE INDEX "idx_zjh_job_queue" ON "zintrust_job_heartbeats" ("job_id", "queue_name");
