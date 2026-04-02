/**
 * Migrations index for @zintrust/system-debugger
 * Export all migrations as an ordered array.
 */
export type { Migration } from './20260331000001_create_zin_debugger_entries_table';

import { migration as createEntries } from './20260331000001_create_zin_debugger_entries_table';
import { migration as createEntriesTags } from './20260331000002_create_zin_debugger_entries_tags_table';
import { migration as createMonitoring } from './20260331000003_create_zin_debugger_monitoring_table';

export const migrations = [createEntries, createEntriesTags, createMonitoring];
