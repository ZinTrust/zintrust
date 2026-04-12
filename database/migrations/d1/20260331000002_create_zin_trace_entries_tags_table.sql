-- Generated from 20260331000002_create_zin_trace_entries_tags_table
CREATE TABLE IF NOT EXISTS "zin_trace_entries_tags" (
  "entry_uuid" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  CONSTRAINT "fk_entry_uuid" FOREIGN KEY ("entry_uuid") REFERENCES "zin_trace_entries" ("uuid") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uniq_zin_trace_entries_tags_entry_uuid_tag" ON "zin_trace_entries_tags" ("entry_uuid", "tag");
CREATE INDEX "idx_zin_trace_entries_tags_tag" ON "zin_trace_entries_tags" ("tag");
