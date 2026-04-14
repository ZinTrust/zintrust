import { TraceContext } from '../context';
import type { ITraceWatcher, ITraceWatcherConfig, NotificationContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactUnknown } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _redactionFields: string[] = [];
let _ignoreRoutes: string[] = [];
let _ignorePath: string[] = [];

const emit = (
  notification: string,
  channels: string[],
  notifiable?: string,
  message?: string,
  payload?: unknown
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePath)) return;
  const content: NotificationContent = {
    notification,
    channels,
    notifiable,
    ...(typeof message === 'string' && message !== ''
      ? { message: redactUnknown(message, _redactionFields) as string }
      : {}),
    ...(payload === undefined ? {} : { payload: redactUnknown(payload, _redactionFields) }),
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.NOTIFICATION,
      content,
      tags: AuthTag.append([notification, ...channels]),
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const NotificationWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.notification === false) return () => undefined;
    _storage = storage;
    _redactionFields = [...config.redaction.keys, ...config.redaction.body];
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePath = config.ignorePath;
    return () => {
      _storage = null;
      _redactionFields = [];
      _ignoreRoutes = [];
      _ignorePath = [];
    };
  },
});
