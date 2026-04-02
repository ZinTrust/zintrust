-- Generated from 20260331000001_create_zin_debugger_entries_table
CREATE TABLE IF NOT EXISTS "zin_debugger_entries" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "uuid" TEXT NOT NULL UNIQUE,
  "batch_id" TEXT NOT NULL,
  "family_hash" TEXT,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "is_latest" BOOLEAN NOT NULL DEFAULT 1,
  "created_at" INTEGER NOT NULL
);
CREATE INDEX "idx_zin_debugger_entries_batch_id" ON "zin_debugger_entries" ("batch_id");
CREATE INDEX "idx_zin_debugger_entries_family_hash" ON "zin_debugger_entries" ("family_hash");
CREATE INDEX "idx_zin_debugger_entries_created_at" ON "zin_debugger_entries" ("created_at");
CREATE INDEX "idx_zin_debugger_entries_type_is_latest" ON "zin_debugger_entries" ("type", "is_latest");
