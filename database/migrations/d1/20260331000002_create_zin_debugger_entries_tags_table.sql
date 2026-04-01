-- Generated from 20260331000002_create_zin_debugger_entries_tags_table
CREATE TABLE IF NOT EXISTS "zin_debugger_entries_tags" (
  "entry_uuid" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  CONSTRAINT "fk_entry_uuid" FOREIGN KEY ("entry_uuid") REFERENCES "zin_debugger_entries" ("uuid") ON DELETE CASCADE
);
CREATE INDEX "idx_zin_debugger_entries_tags_tag" ON "zin_debugger_entries_tags" ("tag");
