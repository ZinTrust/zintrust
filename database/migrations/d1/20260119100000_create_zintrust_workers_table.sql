-- Generated from 20260119100000_create_zintrust_workers_table
CREATE TABLE IF NOT EXISTS "zintrust_workers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL UNIQUE,
  "queue_name" TEXT NOT NULL,
  "version" TEXT,
  "processor_spec" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  "auto_start" BOOLEAN NOT NULL DEFAULT 0,
  "concurrency" INTEGER NOT NULL DEFAULT 1,
  "region" TEXT,
  "features" TEXT,
  "infrastructure" TEXT,
  "datacenter" TEXT,
  "last_error" TEXT,
  "connection_state" TEXT,
  "last_health_check" TEXT,
  "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
