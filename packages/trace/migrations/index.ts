/**
 * Migrations index for @zintrust/trace
 * Export all migrations as an ordered array.
 */
export type { Migration } from './20260331000001_create_zin_trace_entries_table';

import { migration as createEntries } from './20260331000001_create_zin_trace_entries_table';
import { migration as createEntriesTags } from './20260331000002_create_zin_trace_entries_tags_table';
import { migration as createMonitoring } from './20260331000003_create_zin_trace_monitoring_table';
import { migration as widenCreatedAt } from './20260407193000_widen_trace_created_at_for_sql';

export const migrations = [createEntries, createEntriesTags, createMonitoring, widenCreatedAt];
