import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, ViewContent } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];

const emit = (template: string, duration: number): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: ViewContent = { template, duration, hostname: DebuggerContext.getHostname() };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.VIEW,
      content,
      tags: [template],
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const ViewWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.view === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
