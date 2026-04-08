import { TraceContext } from '../context';
import type {
  ClientRequestContent,
  ClientRequestTraceInput,
  ITraceWatcher,
  ITraceWatcherConfig,
} from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactHeaders, redactUnknown } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _redactHeaderNames: string[] = [];
let _redactBodyFields: string[] = [];
let _ignoreRoutes: string[] = [];

const emit = ({
  method,
  url,
  requestHeaders,
  responseStatus,
  duration,
  requestBody,
  responseHeaders,
  responseBody,
  error,
}: ClientRequestTraceInput): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const tags = AuthTag.append([method.toUpperCase()]);
  if ((responseStatus ?? 0) >= 400 || error) tags.push('failed');
  const content: ClientRequestContent = {
    method: method.toUpperCase(),
    url,
    requestHeaders: redactHeaders(requestHeaders, _redactHeaderNames),
    ...(requestBody === undefined
      ? {}
      : { requestBody: redactUnknown(requestBody, _redactBodyFields) }),
    ...(responseStatus === undefined ? {} : { responseStatus }),
    ...(responseHeaders === undefined
      ? {}
      : { responseHeaders: redactHeaders(responseHeaders, _redactHeaderNames) }),
    ...(responseBody === undefined
      ? {}
      : { responseBody: redactUnknown(responseBody, _redactBodyFields) }),
    ...(typeof error === 'string' && error !== '' ? { error } : {}),
    duration,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.CLIENT_REQUEST,
      content,
      tags,
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const HttpClientWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.clientRequest === false) return () => undefined;
    _storage = storage;
    _redactHeaderNames = [...(config.redaction?.keys ?? []), ...(config.redaction?.headers ?? [])];
    _redactBodyFields = [...(config.redaction?.keys ?? []), ...(config.redaction?.body ?? [])];
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _redactBodyFields = [];
      _ignoreRoutes = [];
    };
  },
});
