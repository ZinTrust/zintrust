import { TraceContext } from '../context';
import type { ITraceConfig, ITraceEntry, ITraceStorage } from '../types';
import { EntryType } from '../types';
import { TraceEntryFilter } from '../utils/entryFilter';
import { RequestFilter } from '../utils/requestFilter';

const MAX_IGNORED_BATCHES = 512;

interface IIgnoredBatchTracker {
  has(batchId: string): boolean;
  remember(batchId: string): void;
}

const isObjectValue = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const getEntryUri = (entry: ITraceEntry): string | undefined => {
  if (entry.type !== EntryType.REQUEST) return undefined;

  const content = isObjectValue(entry.content) ? entry.content : undefined;
  const uri = content?.['uri'];
  return typeof uri === 'string' && uri.trim() !== '' ? uri : undefined;
};

const createIgnoredBatchTracker = (): IIgnoredBatchTracker => {
  const ignoredBatchIds = new Set<string>();
  const ignoredBatchOrder: string[] = [];

  const remember = (batchId: string): void => {
    if (ignoredBatchIds.has(batchId)) return;

    ignoredBatchIds.add(batchId);
    ignoredBatchOrder.push(batchId);

    if (ignoredBatchOrder.length <= MAX_IGNORED_BATCHES) return;

    const evictedBatchId = ignoredBatchOrder.shift();
    if (evictedBatchId !== undefined) {
      ignoredBatchIds.delete(evictedBatchId);
    }
  };

  const has = (batchId: string): boolean => {
    return ignoredBatchIds.has(batchId);
  };

  return Object.freeze({ has, remember });
};

const shouldDropForIgnoredRequest = (
  entry: ITraceEntry,
  config: ITraceConfig,
  tracker: IIgnoredBatchTracker
): boolean => {
  if (tracker.has(entry.batchId)) {
    return true;
  }

  const currentPath = TraceContext.getRequestPath();
  if (
    typeof currentPath === 'string' &&
    currentPath !== '' &&
    RequestFilter.matchesIgnoredPath(currentPath, config)
  ) {
    tracker.remember(entry.batchId);
    return true;
  }

  const uri = getEntryUri(entry);
  if (typeof uri === 'string' && RequestFilter.matchesIgnoredPath(uri, config)) {
    tracker.remember(entry.batchId);
    return true;
  }

  return false;
};

export const TraceEntryFiltering = Object.freeze({
  wrapStorage(storage: ITraceStorage, config: ITraceConfig): ITraceStorage {
    const ignoredBatchTracker = createIgnoredBatchTracker();

    return Object.freeze({
      ...storage,
      async writeEntry(entry: ITraceEntry): Promise<void> {
        if (shouldDropForIgnoredRequest(entry, config, ignoredBatchTracker)) return;
        if (!TraceEntryFilter.shouldCapture(entry, config)) return;
        await storage.writeEntry(entry);
      },
    });
  },
});
