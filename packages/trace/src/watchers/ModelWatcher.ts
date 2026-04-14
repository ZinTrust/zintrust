import { TraceContext } from '../context';
import type { ITraceWatcher, ITraceWatcherConfig, ModelContent } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];
let _ignorePaths: string[] = [];

type GlobalModelTraceState = {
  __zintrust_trace_model_emit__?: typeof emit;
};

const emit = (
  action: ModelContent['action'],
  model: string,
  id?: string | number,
  changes?: Record<string, unknown>
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePaths)) return;
  const content: ModelContent = {
    action,
    model,
    id,
    changes,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.MODEL,
      content,
      tags: [model],
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const ModelWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.model === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePaths = config.ignorePaths;
    (globalThis as unknown as GlobalModelTraceState).__zintrust_trace_model_emit__ = emit;
    return () => {
      const globalState = globalThis as unknown as GlobalModelTraceState;
      if (globalState.__zintrust_trace_model_emit__ === emit) {
        delete globalState.__zintrust_trace_model_emit__;
      }
      _storage = null;
      _ignoreRoutes = [];
      _ignorePaths = [];
    };
  },
});
