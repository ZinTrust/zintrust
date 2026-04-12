import type { ITraceConfig, ITraceEntry, ITraceStorage } from '../types';

const DEFAULT_MAX_ENTRY_BYTES = 64 * 1024;
const DEFAULT_MAX_STRING_BYTES = 16 * 1024;
const DEFAULT_MAX_ARRAY_ITEMS = 25;
const DEFAULT_MAX_OBJECT_ENTRIES = 40;
const DEFAULT_MAX_DEPTH = 6;

const DROPPED_FIELD_MESSAGE =
  '[trace] Value dropped because the field exceeded the trace storage size limit.';
const COMPACTED_CONTENT_MESSAGE =
  '[trace] Trace content was compacted because it exceeded the trace storage size limit.';
const REPLACED_CONTENT_MESSAGE = 'Trace content exceeded budget and was replaced.';

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

type TraceDispatchMessage =
  | { operation: 'write'; entry: ITraceEntry }
  | {
      operation: 'update';
      uuid: string;
      patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>;
    };

type QueueApi = {
  get(name?: string): {
    enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
  };
};

type TimeoutManagerApi = {
  withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
    timeoutHandler?: () => Promise<T>
  ): Promise<T>;
};

type QueueWorkerApi = {
  createQueueWorker<TPayload>(options: {
    kindLabel: string;
    defaultQueueName: string;
    maxAttempts: number;
    getLogFields?: (payload: {
      id: string;
      payload: TPayload;
      attempts: number;
    }) => Record<string, unknown>;
    handle(payload: TPayload): Promise<void>;
  }): {
    runOnce(options?: {
      queueName?: string;
      driverName?: string;
      maxItems?: number;
      maxDurationMs?: number;
      concurrency?: number;
    }): Promise<number>;
  };
};

type UnrefableTimer = ReturnType<typeof setInterval> & { unref?: () => void };

type TraceContentBudgetRuntime = {
  queue?: QueueApi | null;
  timeoutManager?: TimeoutManagerApi | null;
  queueWorkerApi?: QueueWorkerApi | null;
};

const startedWorkerKeys = new Set<string>();

const queueMicrotaskSafe = (task: () => void): void => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(task);
    return;
  }

  Promise.resolve()
    .then(() => task())
    .catch(() => undefined);
};

const scheduleTask = (task: () => Promise<void>): void => {
  queueMicrotaskSafe(() => {
    void task().catch(() => undefined);
  });
};

const getReplacementContent = (content: unknown): Record<string, unknown> => {
  return {
    __traceNotice: REPLACED_CONTENT_MESSAGE,
    dropped: true,
    valueType: describeValueType(content),
  };
};

const replaceEntryContent = (entry: ITraceEntry): ITraceEntry => ({
  ...entry,
  content: getReplacementContent(entry.content),
});

const replacePatchContent = (
  patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
): Partial<Pick<ITraceEntry, 'content' | 'isLatest'>> => {
  if (patch.content === undefined) return patch;

  return {
    ...patch,
    content: getReplacementContent(patch.content),
  };
};

const shouldReplaceContent = (content: unknown): boolean => {
  return serializedSize(content) > DEFAULT_MAX_ENTRY_BYTES;
};

const hasQueueDispatch = (config: ITraceConfig): boolean => {
  const driver = config.contentDispatch.driver?.trim();
  return typeof driver === 'string' && driver !== '';
};

const getCoreRuntime = async (): Promise<{
  Queue: QueueApi | null;
  TimeoutManager: TimeoutManagerApi | null;
}> => {
  try {
    const mod = (await import('@zintrust/core')) as unknown as {
      Queue?: QueueApi;
      TimeoutManager?: TimeoutManagerApi;
    };
    return {
      Queue: mod.Queue ?? null,
      TimeoutManager: mod.TimeoutManager ?? null,
    };
  } catch {
    return {
      Queue: null,
      TimeoutManager: null,
    };
  }
};

const getQueueWorkerApi = async (): Promise<QueueWorkerApi | null> => {
  try {
    const mod = (await import('@zintrust/workers')) as unknown as QueueWorkerApi;
    return typeof mod.createQueueWorker === 'function' ? mod : null;
  } catch {
    return null;
  }
};

const enqueueTraceDispatch = async (
  config: ITraceConfig,
  payload: TraceDispatchMessage,
  runtime?: TraceContentBudgetRuntime
): Promise<boolean> => {
  const driverName = config.contentDispatch.driver?.trim();
  if (driverName === undefined || driverName === '') return false;

  const coreRuntime =
    runtime?.queue !== undefined || runtime?.timeoutManager !== undefined
      ? {
          Queue: runtime?.queue ?? null,
          TimeoutManager: runtime?.timeoutManager ?? null,
        }
      : await getCoreRuntime();
  const queueApi = coreRuntime.Queue;
  if (queueApi === null) return false;

  try {
    const driver = queueApi.get(driverName);
    const timeoutMs = Math.max(1, config.contentDispatch.enqueueTimeoutMs);
    if (coreRuntime.TimeoutManager === null) {
      await driver.enqueue(config.contentDispatch.queueName, payload);
    } else {
      await coreRuntime.TimeoutManager.withTimeout(
        () => driver.enqueue(config.contentDispatch.queueName, payload),
        timeoutMs,
        'trace-content-dispatch-enqueue'
      );
    }

    return true;
  } catch {
    return false;
  }
};

const persistWriteFallback = async (storage: ITraceStorage, entry: ITraceEntry): Promise<void> => {
  await storage.writeEntry(
    shouldReplaceContent(entry.content) ? replaceEntryContent(entry) : entry
  );
};

const persistUpdateFallback = async (
  storage: ITraceStorage,
  uuid: string,
  patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
): Promise<void> => {
  await storage.updateEntry(
    uuid,
    patch.content !== undefined && shouldReplaceContent(patch.content)
      ? replacePatchContent(patch)
      : patch
  );
};

const processQueuedMessage = async (
  storage: ITraceStorage,
  message: TraceDispatchMessage
): Promise<void> => {
  if (message.operation === 'write') {
    await storage.writeEntry(fitEntryToBudget(message.entry));
    return;
  }

  await storage.updateEntry(message.uuid, fitPatchToBudget(message.patch));
};

const ensureWorkerTimer = (_key: string, timer: ReturnType<typeof setInterval>): void => {
  const unrefable = timer as UnrefableTimer;
  if (typeof unrefable.unref === 'function') {
    unrefable.unref();
  }
};

const startInternalDispatchWorker = (
  storage: ITraceStorage,
  config: ITraceConfig,
  runtime?: TraceContentBudgetRuntime
): void => {
  if (!hasQueueDispatch(config) || config.contentDispatch.worker.enabled !== true) return;

  const driverName = config.contentDispatch.driver?.trim() ?? '';
  const key = `${driverName}:${config.contentDispatch.queueName}`;
  if (startedWorkerKeys.has(key)) return;
  startedWorkerKeys.add(key);

  scheduleTask(async () => {
    const workersApi = runtime?.queueWorkerApi ?? (await getQueueWorkerApi());
    if (workersApi === null) {
      startedWorkerKeys.delete(key);
      return;
    }

    let running = false;
    const runWorker = async (): Promise<void> => {
      if (running) return;
      running = true;
      try {
        const worker = workersApi.createQueueWorker<TraceDispatchMessage>({
          kindLabel: 'trace-content-dispatch',
          defaultQueueName: config.contentDispatch.queueName,
          maxAttempts: 1,
          getLogFields: () => ({
            queueName: config.contentDispatch.queueName,
            driverName,
          }),
          handle: async (payload) => {
            await processQueuedMessage(storage, payload);
          },
        });

        await worker.runOnce({
          queueName: config.contentDispatch.queueName,
          driverName,
          maxDurationMs: Math.max(1, config.contentDispatch.worker.maxDurationMs),
          concurrency: Math.max(1, config.contentDispatch.worker.concurrency),
        });
      } finally {
        running = false;
      }
    };

    await runWorker();

    const intervalMs = Math.max(100, config.contentDispatch.worker.intervalMs);
    ensureWorkerTimer(
      key,
      setInterval(() => {
        void runWorker();
      }, intervalMs)
    );
  });
};

const dispatchWrite = (
  storage: ITraceStorage,
  config: ITraceConfig,
  entry: ITraceEntry,
  runtime?: TraceContentBudgetRuntime
): void => {
  scheduleTask(async () => {
    if (hasQueueDispatch(config)) {
      const enqueued = await enqueueTraceDispatch(config, { operation: 'write', entry }, runtime);
      if (enqueued) return;
    }

    await persistWriteFallback(storage, entry);
  });
};

const dispatchUpdate = (
  storage: ITraceStorage,
  config: ITraceConfig,
  uuid: string,
  patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>,
  runtime?: TraceContentBudgetRuntime
): void => {
  scheduleTask(async () => {
    if (hasQueueDispatch(config)) {
      const enqueued = await enqueueTraceDispatch(
        config,
        { operation: 'update', uuid, patch },
        runtime
      );
      if (enqueued) return;
    }

    await persistUpdateFallback(storage, uuid, patch);
  });
};

export const TraceContentBudget = Object.freeze({
  wrapStorage(
    storage: ITraceStorage,
    config: ITraceConfig,
    runtime?: TraceContentBudgetRuntime
  ): ITraceStorage {
    startInternalDispatchWorker(storage, config, runtime);

    return Object.freeze({
      ...storage,
      writeEntry: async (entry: ITraceEntry): Promise<void> => {
        dispatchWrite(storage, config, entry, runtime);
      },
      updateEntry: async (
        uuid: string,
        patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
      ): Promise<void> => {
        dispatchUpdate(storage, config, uuid, patch, runtime);
      },
    });
  },
});
