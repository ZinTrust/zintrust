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

const compactTopLevelObjectToBudget = (value: Record<string, unknown>): Record<string, unknown> => {
  const compacted: Record<string, unknown> = {
    ...value,
    __traceNotice: COMPACTED_CONTENT_MESSAGE,
  };

  const keysByDescendingSize = Object.keys(compacted)
    .filter((key) => key !== '__traceNotice')
    .sort((left, right) => serializedSize(compacted[right]) - serializedSize(compacted[left]));

  for (const key of keysByDescendingSize) {
    if (serializedSize(compacted) <= DEFAULT_MAX_ENTRY_BYTES) break;
    compacted[key] = DROPPED_FIELD_MESSAGE;
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

  if (typeof compacted === 'object' && compacted !== null && !Array.isArray(compacted)) {
    const topLevelCompacted = compactTopLevelObjectToBudget(compacted as Record<string, unknown>);
    if (serializedSize(topLevelCompacted) <= DEFAULT_MAX_ENTRY_BYTES) {
      return topLevelCompacted;
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
