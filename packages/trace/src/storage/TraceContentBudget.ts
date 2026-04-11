import type { ITraceEntry, ITraceStorage } from '../types';

const DEFAULT_MAX_ENTRY_BYTES = 64 * 1024;
const DEFAULT_MAX_STRING_BYTES = 16 * 1024;
const DEFAULT_MAX_ARRAY_ITEMS = 25;
const DEFAULT_MAX_OBJECT_ENTRIES = 40;
const DEFAULT_MAX_DEPTH = 6;

const DROPPED_FIELD_MESSAGE =
  '[trace] Value dropped because the field exceeded the trace storage size limit.';
const COMPACTED_CONTENT_MESSAGE =
  '[trace] Trace content was compacted because it exceeded the trace storage size limit.';

const encoder = new TextEncoder();

const serializedSize = (value: unknown): number => {
  try {
    return encoder.encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

const describeValueType = (value: unknown): string => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
};

type TracePathSegment = string | number;

type TracePathCandidate = {
  path: TracePathSegment[];
  size: number;
};

const chooseLargerCandidate = (
  left: TracePathCandidate | null,
  right: TracePathCandidate | null
): TracePathCandidate | null => {
  if (left === null) return right;
  if (right === null) return left;
  return right.size > left.size ? right : left;
};

const fallbackCandidate = (value: unknown, path: TracePathSegment[]): TracePathCandidate | null => {
  return path.length === 0 ? null : { path, size: serializedSize(value) };
};

const findLargestDroppablePathInArray = (
  value: unknown[],
  path: TracePathSegment[]
): TracePathCandidate | null => {
  let best: TracePathCandidate | null = null;

  for (const [index, item] of value.entries()) {
    best = chooseLargerCandidate(best, findLargestDroppablePath(item, [...path, index]));
  }

  return best ?? fallbackCandidate(value, path);
};

const findLargestDroppablePathInObject = (
  value: Record<string, unknown>,
  path: TracePathSegment[]
): TracePathCandidate | null => {
  let best: TracePathCandidate | null = null;

  for (const [key, entryValue] of Object.entries(value)) {
    if (key === '__traceNotice') continue;
    best = chooseLargerCandidate(best, findLargestDroppablePath(entryValue, [...path, key]));
  }

  return best ?? fallbackCandidate(value, path);
};

const findLargestDroppablePath = (
  value: unknown,
  path: TracePathSegment[] = []
): TracePathCandidate | null => {
  if (Array.isArray(value)) return findLargestDroppablePathInArray(value, path);
  if (typeof value === 'object' && value !== null) {
    return findLargestDroppablePathInObject(value as Record<string, unknown>, path);
  }

  return fallbackCandidate(value, path);
};

const replaceAtPath = (value: unknown, path: TracePathSegment[], replacement: unknown): unknown => {
  if (path.length === 0) return replacement;

  const [segment, ...rest] = path;

  if (Array.isArray(value) && typeof segment === 'number') {
    const next = value.slice();
    next[segment] = replaceAtPath(next[segment], rest, replacement);
    return next;
  }

  if (typeof value === 'object' && value !== null && typeof segment === 'string') {
    const current = value as Record<string, unknown>;
    return {
      ...current,
      [segment]: replaceAtPath(current[segment], rest, replacement),
    };
  }

  return value;
};

const compactValue = (value: unknown, depth: number): unknown => {
  if (depth >= DEFAULT_MAX_DEPTH) {
    return DROPPED_FIELD_MESSAGE;
  }

  if (typeof value === 'string') {
    return serializedSize(value) > DEFAULT_MAX_STRING_BYTES ? DROPPED_FIELD_MESSAGE : value;
  }

  if (Array.isArray(value)) {
    const next = value
      .slice(0, DEFAULT_MAX_ARRAY_ITEMS)
      .map((item) => compactValue(item, depth + 1));

    if (value.length > DEFAULT_MAX_ARRAY_ITEMS) {
      next.push(
        `[trace] ${String(value.length - DEFAULT_MAX_ARRAY_ITEMS)} additional items were dropped.`
      );
    }

    return next;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const entries = Object.entries(value);
  const compactedEntries = entries
    .slice(0, DEFAULT_MAX_OBJECT_ENTRIES)
    .map(([key, entryValue]) => [key, compactValue(entryValue, depth + 1)]);

  if (entries.length > DEFAULT_MAX_OBJECT_ENTRIES) {
    compactedEntries.push([
      '__traceNotice',
      `[trace] ${String(entries.length - DEFAULT_MAX_OBJECT_ENTRIES)} additional fields were dropped.`,
    ]);
  }

  return Object.fromEntries(compactedEntries);
};

const compactStructuredValueToBudget = (value: unknown): unknown => {
  let compacted: unknown =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? {
          ...(value as Record<string, unknown>),
          __traceNotice: COMPACTED_CONTENT_MESSAGE,
        }
      : value;

  while (serializedSize(compacted) > DEFAULT_MAX_ENTRY_BYTES) {
    const candidate = findLargestDroppablePath(compacted);
    if (candidate === null) break;
    compacted = replaceAtPath(compacted, candidate.path, DROPPED_FIELD_MESSAGE);
  }

  return compacted;
};

const fitContentToBudget = (content: unknown): unknown => {
  if (serializedSize(content) <= DEFAULT_MAX_ENTRY_BYTES) {
    return content;
  }

  const compacted = compactValue(content, 0);
  if (serializedSize(compacted) <= DEFAULT_MAX_ENTRY_BYTES) {
    return compacted;
  }

  if (typeof compacted === 'object' && compacted !== null) {
    const budgetCompacted = compactStructuredValueToBudget(compacted);
    if (serializedSize(budgetCompacted) <= DEFAULT_MAX_ENTRY_BYTES) {
      return budgetCompacted;
    }
  }

  return {
    __traceNotice: COMPACTED_CONTENT_MESSAGE,
    dropped: true,
    valueType: describeValueType(content),
  };
};

const fitEntryToBudget = (entry: ITraceEntry): ITraceEntry => ({
  ...entry,
  content: fitContentToBudget(entry.content),
});

const fitPatchToBudget = (
  patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
): Partial<Pick<ITraceEntry, 'content' | 'isLatest'>> => {
  if (patch.content === undefined) return patch;

  return {
    ...patch,
    content: fitContentToBudget(patch.content),
  };
};

export const TraceContentBudget = Object.freeze({
  wrapStorage(storage: ITraceStorage): ITraceStorage {
    return Object.freeze({
      ...storage,
      writeEntry: async (entry: ITraceEntry): Promise<void> => {
        await storage.writeEntry(fitEntryToBudget(entry));
      },
      updateEntry: async (
        uuid: string,
        patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
      ): Promise<void> => {
        await storage.updateEntry(uuid, fitPatchToBudget(patch));
      },
    });
  },
});
