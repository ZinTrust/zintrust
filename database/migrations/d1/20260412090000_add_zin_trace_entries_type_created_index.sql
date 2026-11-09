-- Generated from 20260412090000_add_zin_trace_entries_type_created_index
CREATE INDEX "idx_zin_trace_type_created_id" ON "zin_trace_entries" ("type", "created_at", "id");
