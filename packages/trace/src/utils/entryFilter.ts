import type {
  ITraceConfig,
  ITraceEntry,
  TraceFilterRule,
  TraceRequestWatcherConfig,
  WatcherToggles,
} from '../types';
import { EntryType } from '../types';

const isObjectValue = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizeTerms = (terms?: string[]): string[] => {
  if (!Array.isArray(terms)) return [];

  return terms
    .filter((term): term is string => typeof term === 'string')
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term !== '');
};

const matchesRule = (haystack: string, rule?: TraceFilterRule): boolean => {
  if (!rule) return true;

  const include = normalizeTerms(rule.include);
  const exclude = normalizeTerms(rule.exclude);

  if (exclude.some((term) => haystack.includes(term))) return false;
  if (include.length === 0) return true;

  return include.some((term) => haystack.includes(term));
};

const toSearchableText = (entry: ITraceEntry): string => {
  const sections = [entry.type, entry.batchId, ...(entry.tags ?? [])];

  try {
    sections.push(JSON.stringify(entry.content) ?? '');
  } catch {
    sections.push(String(entry.content ?? ''));
  }

  return sections.join(' ').toLowerCase();
};

const watcherKeyByEntryType: Record<ITraceEntry['type'], keyof WatcherToggles> = {
  [EntryType.REQUEST]: 'request',
  [EntryType.QUERY]: 'query',
  [EntryType.EXCEPTION]: 'exception',
  [EntryType.LOG]: 'log',
  [EntryType.JOB]: 'job',
  [EntryType.CACHE]: 'cache',
  [EntryType.SCHEDULE]: 'schedule',
  [EntryType.MAIL]: 'mail',
  [EntryType.AUTH]: 'auth',
  [EntryType.EVENT]: 'event',
  [EntryType.MODEL]: 'model',
  [EntryType.NOTIFICATION]: 'notification',
  [EntryType.REDIS]: 'redis',
  [EntryType.GATE]: 'gate',
  [EntryType.MIDDLEWARE]: 'middleware',
  [EntryType.COMMAND]: 'command',
  [EntryType.BATCH]: 'batch',
  [EntryType.DUMP]: 'dump',
  [EntryType.VIEW]: 'view',
  [EntryType.CLIENT_REQUEST]: 'clientRequest',
};

const getRequestMethodRule = (
  watcher: TraceRequestWatcherConfig,
  entry: ITraceEntry
): TraceFilterRule | undefined => {
  if (entry.type !== EntryType.REQUEST) return undefined;

  const content = isObjectValue(entry.content) ? entry.content : undefined;
  const methodValue = content?.['method'];
  const method = typeof methodValue === 'string' ? methodValue.trim().toLowerCase() : '';

  if (method === 'get') return watcher.get;
  if (method === 'post') return watcher.post;
  if (method === 'put') return watcher.put;
  if (method === 'patch') return watcher.patch;
  if (method === 'delete' || method === 'del') return watcher.delete;

  return watcher.all;
};

export const TraceEntryFilter = Object.freeze({
  shouldCapture(entry: ITraceEntry, config: ITraceConfig): boolean {
    const watcherKey = watcherKeyByEntryType[entry.type];
    const watcher = config.watchers[watcherKey];
    if (watcher === false) return false;
    if (!isObjectValue(watcher)) return true;

    const haystack = toSearchableText(entry);
    if (!matchesRule(haystack, watcher)) return false;

    if (watcherKey === 'request') {
      const requestWatcher = watcher as TraceRequestWatcherConfig;
      const methodRule = getRequestMethodRule(requestWatcher, entry);
      if (!matchesRule(haystack, requestWatcher.all)) return false;
      if (!matchesRule(haystack, methodRule)) return false;
    }

    return true;
  },
});
