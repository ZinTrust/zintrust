import type { ITraceConfig, ITraceEntry, ITraceStorage } from '../types';
import { TraceEntryFilter } from '../utils/entryFilter';

export const TraceEntryFiltering = Object.freeze({
  wrapStorage(storage: ITraceStorage, config: ITraceConfig): ITraceStorage {
    return Object.freeze({
      ...storage,
      async writeEntry(entry: ITraceEntry) {
        if (!TraceEntryFilter.shouldCapture(entry, config)) return;
        await storage.writeEntry(entry);
      },
    });
  },
});
