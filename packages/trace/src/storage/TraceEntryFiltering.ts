import { TraceContext } from '../context';
import type { ITraceConfig, ITraceEntry, ITraceStorage } from '../types';
import { EntryType } from '../types';
import { TraceEntryFilter } from '../utils/entryFilter';
import { RequestFilter } from '../utils/requestFilter';

const isObjectValue = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const getEntryUri = (entry: ITraceEntry): string | undefined => {
  if (entry.type !== EntryType.REQUEST) return undefined;

  const content = isObjectValue(entry.content) ? entry.content : undefined;
  const uri = content?.['uri'];
  return typeof uri === 'string' && uri.trim() !== '' ? uri : undefined;
};

const getEntryResponseStatus = (entry: ITraceEntry): number | undefined => {
  if (entry.type !== EntryType.REQUEST) return undefined;

  const content = isObjectValue(entry.content) ? entry.content : undefined;
  const status = content?.['responseStatus'];
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
};

const shouldDropForIgnoredRequest = (entry: ITraceEntry, config: ITraceConfig): boolean => {
  if (entry.type !== EntryType.REQUEST) return false;

  const currentPath = TraceContext.getRequestPath();
  if (
    typeof currentPath === 'string' &&
    currentPath !== '' &&
    RequestFilter.matchesIgnoredPath(currentPath, config)
  ) {
    return true;
  }

  const uri = getEntryUri(entry);
  if (typeof uri === 'string' && RequestFilter.matchesIgnoredPath(uri, config)) {
    return true;
  }

  return false;
};

const shouldDropNotFoundRequest = (entry: ITraceEntry, config: ITraceConfig): boolean => {
  if (config.captureNotFound !== false) return false;
  if (entry.type !== EntryType.REQUEST) return false;
  return getEntryResponseStatus(entry) === 404;
};

export const TraceEntryFiltering = Object.freeze({
  wrapStorage(storage: ITraceStorage, config: ITraceConfig): ITraceStorage {
    return Object.freeze({
      ...storage,
      async writeEntry(entry: ITraceEntry): Promise<void> {
        if (shouldDropForIgnoredRequest(entry, config)) return;
        if (shouldDropNotFoundRequest(entry, config)) return;
        if (!TraceEntryFilter.shouldCapture(entry, config)) return;
        await storage.writeEntry(entry);
      },
    });
  },
});
