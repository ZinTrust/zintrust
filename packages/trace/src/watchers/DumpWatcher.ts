import { TraceContext } from '../context';
import type { DumpContent, ITraceWatcher, ITraceWatcherConfig } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _enabled = false;
let _ignoreRoutes: string[] = [];
let _ignorePath: string[] = [];

/** Explicitly opt-in (enabled only when config.watchers.dump === true, not just non-false). */
const emit = (value: unknown, file?: string, line?: number): void => {
  if (!_storage || !_enabled) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePath)) return;
  const content: DumpContent = { value, file, line, hostname: TraceContext.getHostname() };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.DUMP,
      content,
      tags: [],
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const DumpWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    // DumpWatcher requires explicit opt-in (=== true), not just absence of false
    if (config.watchers.dump !== true) return () => undefined;
    _storage = storage;
    _enabled = true;
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePath = config.ignorePath;
    return () => {
      _storage = null;
      _enabled = false;
      _ignoreRoutes = [];
      _ignorePath = [];
    };
  },
});
