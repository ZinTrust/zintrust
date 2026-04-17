import { ErrorFactory } from '@exceptions/ZintrustError';
import { isFunction, isNonEmptyString, isObject } from '@helper/index';

export type ContextLoaderBatchKey = string | number;
export type ContextLoaderMode = 'sequential' | 'batch';

export type ContextLoaderContext = Record<string, unknown>;

export type ContextLoaderResolver<
  TValue = unknown,
  TContext extends ContextLoaderContext = ContextLoaderContext,
> = (context: Readonly<TContext>) => Promise<TValue>;

export type ContextLoaderBatchResult<TKey extends ContextLoaderBatchKey = ContextLoaderBatchKey> =
  | Map<TKey, unknown>
  | Record<string, unknown>
  | null
  | undefined;

export type ContextLoaderBatchHandler<TKey extends ContextLoaderBatchKey = ContextLoaderBatchKey> =
  (keys: TKey[]) => Promise<ContextLoaderBatchResult<TKey>>;

export type ContextLoaderPlan = {
  load: <TValue = unknown>(
    key: string,
    resolver: ContextLoaderResolver<TValue>
  ) => ContextLoaderPlan;
  fromBatch: <TKey extends ContextLoaderBatchKey = ContextLoaderBatchKey>(
    name: string,
    key: TKey
  ) => Promise<unknown>;
  resolve: <TResolved extends ContextLoaderContext = ContextLoaderContext>() => Promise<
    Readonly<TResolved>
  >;
};

export type ContextLoaderInstance = {
  load: <TValue = unknown>(
    key: string,
    resolver: ContextLoaderResolver<TValue>
  ) => ContextLoaderPlan;
  batch: (name: string, handler: ContextLoaderBatchHandler) => ContextLoaderInstance;
  fromBatch: (name: string, key: ContextLoaderBatchKey) => Promise<unknown>;
  hasBatch: (name: string) => boolean;
  listBatches: () => string[];
  unregisterBatch: (name: string) => void;
  clearBatches: () => void;
};

export type ContextLoaderNamespace = {
  create: (options?: { mode?: ContextLoaderMode }) => ContextLoaderInstance;
};

type ContextLoaderStep = {
  key: string;
  resolver: ContextLoaderResolver;
};

type BatchQueueRequest = {
  key: ContextLoaderBatchKey;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

type BatchQueueState = {
  requests: BatchQueueRequest[];
  scheduled: boolean;
};

const scheduleMicrotask = (task: () => void): void => {
  if (typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(task);
    return;
  }

  void Promise.resolve().then(task);
};

const normalizeBatchName = (name: string): string => {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase();

  if (!isNonEmptyString(normalized)) {
    throw ErrorFactory.createValidationError('ContextLoader batch name must be a non-empty string');
  }

  return normalized;
};

const normalizeLoadKey = (key: string): string => {
  const normalized = String(key ?? '').trim();
  if (!isNonEmptyString(normalized)) {
    throw ErrorFactory.createValidationError('ContextLoader load key must be a non-empty string');
  }
  return normalized;
};

const assertBatchKey = (key: ContextLoaderBatchKey): void => {
  if (typeof key === 'string' && key.trim() !== '') {
    return;
  }

  if (typeof key === 'number' && Number.isFinite(key)) {
    return;
  }

  throw ErrorFactory.createValidationError(
    'ContextLoader batch key must be a non-empty string or finite number'
  );
};

const extractBatchValue = (
  result: ContextLoaderBatchResult,
  key: ContextLoaderBatchKey
): unknown => {
  if (result instanceof Map) {
    return result.has(key) ? (result.get(key) ?? null) : null;
  }

  if (isObject(result)) {
    const recordKey = typeof key === 'number' ? String(key) : key;
    return recordKey in result ? (result[recordKey] ?? null) : null;
  }

  return null;
};

const dedupeBatchKeys = (requests: BatchQueueRequest[]): ContextLoaderBatchKey[] => {
  const seen = new Set<string>();
  const keys: ContextLoaderBatchKey[] = [];

  for (const request of requests) {
    const signature = `${typeof request.key}:${String(request.key)}`;
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    keys.push(request.key);
  }

  return keys;
};

const freezeContext = <TContext extends ContextLoaderContext>(
  context: TContext
): Readonly<TContext> => {
  return Object.freeze({ ...context });
};

const executePlanSteps = async (
  steps: ContextLoaderStep[]
): Promise<Readonly<ContextLoaderContext>> => {
  const resolved = await steps.reduce<Promise<ContextLoaderContext>>(async (accPromise, step) => {
    const accumulated = await accPromise;
    const snapshot = freezeContext(accumulated);

    return {
      ...accumulated,
      [step.key]: await step.resolver(snapshot),
    };
  }, Promise.resolve({}));

  return freezeContext(resolved);
};

const createFlushBatch = (
  batchHandlers: Map<string, ContextLoaderBatchHandler>,
  batchQueues: Map<string, BatchQueueState>
) => {
  return async (name: string): Promise<void> => {
    const queue = batchQueues.get(name);
    const handler = batchHandlers.get(name);

    if (!queue || !handler) {
      return;
    }

    const requests = queue.requests.splice(0);
    queue.scheduled = false;
    if (requests.length === 0) {
      return;
    }

    try {
      const keys = dedupeBatchKeys(requests);
      const result = await handler(keys);
      for (const request of requests) {
        request.resolve(extractBatchValue(result, request.key));
      }
    } catch (error) {
      for (const request of requests) {
        request.reject(error);
      }
    }
  };
};

const createSequentialBatchPromise = async (
  handler: ContextLoaderBatchHandler,
  key: ContextLoaderBatchKey
): Promise<unknown> => {
  return handler([key]).then((result) => extractBatchValue(result, key));
};

const createPlan = (root: ContextLoaderInstance, steps: ContextLoaderStep[]): ContextLoaderPlan => {
  let resolvePromise: Promise<Readonly<ContextLoaderContext>> | null = null;

  const plan: ContextLoaderPlan = Object.freeze({
    load(key: string, resolver: ContextLoaderResolver): ContextLoaderPlan {
      const normalizedKey = normalizeLoadKey(key);
      if (!isFunction(resolver)) {
        throw ErrorFactory.createValidationError('ContextLoader resolver must be a function');
      }
      if (steps.some((step) => step.key === normalizedKey)) {
        throw ErrorFactory.createValidationError(
          `ContextLoader key already registered: ${normalizedKey}`
        );
      }

      return createPlan(root, [...steps, { key: normalizedKey, resolver }]);
    },
    async fromBatch(name: string, key: ContextLoaderBatchKey): Promise<unknown> {
      return root.fromBatch(name, key);
    },
    async resolve<TResolved extends ContextLoaderContext = ContextLoaderContext>(): Promise<
      Readonly<TResolved>
    > {
      resolvePromise ??= executePlanSteps(steps);

      return resolvePromise as Promise<Readonly<TResolved>>;
    },
  });

  return plan;
};

const create = (options: { mode?: ContextLoaderMode } = {}): ContextLoaderInstance => {
  const mode = options.mode ?? 'sequential';
  const batchHandlers = new Map<string, ContextLoaderBatchHandler>();
  const batchQueues = new Map<string, BatchQueueState>();
  const flushBatch = createFlushBatch(batchHandlers, batchQueues);

  const root: ContextLoaderInstance = Object.freeze({
    load(key: string, resolver: ContextLoaderResolver): ContextLoaderPlan {
      const normalizedKey = normalizeLoadKey(key);
      if (!isFunction(resolver)) {
        throw ErrorFactory.createValidationError('ContextLoader resolver must be a function');
      }

      return createPlan(root, [{ key: normalizedKey, resolver }]);
    },
    batch(name: string, handler: ContextLoaderBatchHandler): ContextLoaderInstance {
      const normalizedName = normalizeBatchName(name);
      if (!isFunction(handler)) {
        throw ErrorFactory.createValidationError('ContextLoader batch handler must be a function');
      }

      batchHandlers.set(normalizedName, handler);
      return this;
    },
    async fromBatch(name: string, key: ContextLoaderBatchKey): Promise<unknown> {
      const normalizedName = normalizeBatchName(name);
      assertBatchKey(key);

      const handler = batchHandlers.get(normalizedName);
      if (!handler) {
        throw ErrorFactory.createConfigError(
          `ContextLoader batch not registered: ${normalizedName}`
        );
      }

      if (mode === 'sequential') {
        return createSequentialBatchPromise(handler, key);
      }

      return new Promise<unknown>((resolve, reject) => {
        const queue = batchQueues.get(normalizedName) ?? { requests: [], scheduled: false };
        queue.requests.push({ key, resolve, reject });
        batchQueues.set(normalizedName, queue);

        if (!queue.scheduled) {
          queue.scheduled = true;
          scheduleMicrotask(() => {
            void flushBatch(normalizedName);
          });
        }
      });
    },
    hasBatch(name: string): boolean {
      return batchHandlers.has(normalizeBatchName(name));
    },
    listBatches(): string[] {
      return Array.from(batchHandlers.keys()).sort((left, right) => left.localeCompare(right));
    },
    unregisterBatch(name: string): void {
      const normalizedName = normalizeBatchName(name);
      batchHandlers.delete(normalizedName);
      batchQueues.delete(normalizedName);
    },
    clearBatches(): void {
      batchHandlers.clear();
      batchQueues.clear();
    },
  });

  return root;
};

export const ContextLoader: ContextLoaderNamespace = Object.freeze({
  create,
});
