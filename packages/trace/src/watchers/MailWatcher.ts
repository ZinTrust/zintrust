/**
 * MailWatcher — records mail dispatch intent and rendered content.
 */
import { TraceContext } from '../context';
import type { ITraceWatcher, ITraceWatcherConfig, MailContent } from '../types';
import { EntryType } from '../types';
import { redactUnknown } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _redactionFields: string[] = [];
let _ignoreRoutes: string[] = [];

const emit = (
  to: string,
  subject: string,
  template?: string,
  text?: string,
  html?: string
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: MailContent = {
    to,
    subject,
    template,
    ...(typeof text === 'string' && text !== ''
      ? { text: redactUnknown(text, _redactionFields) as string }
      : {}),
    ...(typeof html === 'string' && html !== ''
      ? { html: redactUnknown(html, _redactionFields) as string }
      : {}),
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.MAIL,
      content,
      tags: [],
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const MailWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.mail === false) return () => undefined;
    _storage = storage;
    _redactionFields = [...config.redaction.keys, ...config.redaction.body];
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _redactionFields = [];
      _ignoreRoutes = [];
    };
  },
});
