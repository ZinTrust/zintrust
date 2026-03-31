import { DebuggerContext } from '../context';
import type { ClientRequestContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';
import { redactHeaders } from '../utils/redact';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _redactHeaderNames: string[] = [];

const emit = (
  method: string,
  url: string,
  requestHeaders: Record<string, string>,
  responseStatus: number,
  duration: number
): void => {
  if (!_storage) return;
  const tags = [method.toUpperCase()];
  if (responseStatus >= 400) tags.push('failed');
  const content: ClientRequestContent = {
    method: method.toUpperCase(),
    url,
    requestHeaders: redactHeaders(requestHeaders, _redactHeaderNames),
    responseStatus,
    duration,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.CLIENT_REQUEST,
      content,
      tags,
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const HttpClientWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.clientRequest === false) return () => undefined;
    _storage = storage;
    _redactHeaderNames = config.redaction?.headers ?? [];
    return () => {
      _storage = null;
    };
  },
});
