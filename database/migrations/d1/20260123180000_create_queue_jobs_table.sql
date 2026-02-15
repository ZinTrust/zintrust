-- Generated from 20260123180000_create_queue_jobs_table
CREATE TABLE IF NOT EXISTS "queue_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "queue" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "reserved_at" TEXT,
  "available_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failed_at" TEXT,
  "error_message" TEXT
);
CREATE INDEX "idx_queue_jobs_queue" ON "queue_jobs" ("queue");
CREATE INDEX "idx_queue_jobs_available_at" ON "queue_jobs" ("available_at");
CREATE INDEX "idx_queue_jobs_reserved_at" ON "queue_jobs" ("reserved_at");
CREATE INDEX "idx_queue_jobs_failed_at" ON "queue_jobs" ("failed_at");
CREATE TABLE IF NOT EXISTS "queue_jobs_failed" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "original_id" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "failed_at" TEXT NOT NULL,
  "error_message" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "idx_queue_jobs_failed_queue_failed_at" ON "queue_jobs_failed" ("queue", "failed_at");
CREATE INDEX "idx_queue_jobs_failed_failed_at" ON "queue_jobs_failed" ("failed_at");
