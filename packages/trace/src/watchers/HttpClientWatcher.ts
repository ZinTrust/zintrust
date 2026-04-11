import { TraceContext } from '../context';
import type {
  ClientRequestContent,
  ClientRequestTraceInput,
  ITraceWatcher,
  ITraceWatcherConfig,
  TraceClientRequestCaptureRule,
  TraceClientRequestWatcherConfig,
} from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactHeaders, redactUnknown } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _redactHeaderNames: string[] = [];
let _redactBodyFields: string[] = [];
let _ignoreRoutes: string[] = [];
let _clientRequestWatcher: TraceClientRequestWatcherConfig | undefined;

const isObjectValue = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const resolveSource = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
};

const resolveSourceRule = (
  source: string | undefined
): TraceClientRequestCaptureRule | undefined => {
  if (source === undefined) return undefined;
  return _clientRequestWatcher?.sources?.[source];
};

const shouldCaptureField = (
  field: keyof Pick<
    TraceClientRequestCaptureRule,
    'requestHeaders' | 'requestBody' | 'responseHeaders' | 'responseBody'
  >,
  sourceRule: TraceClientRequestCaptureRule | undefined
): boolean => {
  const scoped = sourceRule?.[field];
  if (typeof scoped === 'boolean') return scoped;
  const global = _clientRequestWatcher?.[field];
  if (typeof global === 'boolean') return global;
  return true;
};

const buildRequestHeaders = (
  requestHeaders: Record<string, string>,
  sourceRule: TraceClientRequestCaptureRule | undefined
): Pick<ClientRequestContent, 'requestHeaders'> => {
  return shouldCaptureField('requestHeaders', sourceRule)
    ? { requestHeaders: redactHeaders(requestHeaders, _redactHeaderNames) }
    : { requestHeaders: {} };
};

const buildRequestBody = (
  requestBody: unknown,
  sourceRule: TraceClientRequestCaptureRule | undefined
): Partial<Pick<ClientRequestContent, 'requestBody'>> => {
  if (requestBody === undefined) return {};
  if (!shouldCaptureField('requestBody', sourceRule)) return {};
  return { requestBody: redactUnknown(requestBody, _redactBodyFields) };
};

const buildResponseHeaders = (
  responseHeaders: Record<string, string> | undefined,
  sourceRule: TraceClientRequestCaptureRule | undefined
): Partial<Pick<ClientRequestContent, 'responseHeaders'>> => {
  if (responseHeaders === undefined) return {};
  if (!shouldCaptureField('responseHeaders', sourceRule)) return {};
  return { responseHeaders: redactHeaders(responseHeaders, _redactHeaderNames) };
};

const buildResponseBody = (
  responseBody: unknown,
  sourceRule: TraceClientRequestCaptureRule | undefined
): Partial<Pick<ClientRequestContent, 'responseBody'>> => {
  if (responseBody === undefined) return {};
  if (!shouldCaptureField('responseBody', sourceRule)) return {};
  return { responseBody: redactUnknown(responseBody, _redactBodyFields) };
};

const buildClientRequestContent = (
  input: ClientRequestTraceInput,
  sourceRule: TraceClientRequestCaptureRule | undefined,
  normalizedSource: string | undefined
): ClientRequestContent => {
  return {
    ...(normalizedSource === undefined ? {} : { source: normalizedSource }),
    method: input.method.toUpperCase(),
    url: input.url,
    ...buildRequestHeaders(input.requestHeaders, sourceRule),
    ...buildRequestBody(input.requestBody, sourceRule),
    ...(input.responseStatus === undefined ? {} : { responseStatus: input.responseStatus }),
    ...buildResponseHeaders(input.responseHeaders, sourceRule),
    ...buildResponseBody(input.responseBody, sourceRule),
    ...(typeof input.error === 'string' && input.error !== '' ? { error: input.error } : {}),
    duration: input.duration,
    hostname: TraceContext.getHostname(),
  };
};

const isWatcherEnabled = (
  value: ITraceWatcherConfig['config']['watchers']['clientRequest']
): boolean => {
  if (value === false) return false;
  if (isObjectValue(value) && value.enabled === false) return false;
  return true;
};

const emit = ({
  source,
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
  const normalizedSource = resolveSource(source);
  const sourceRule = resolveSourceRule(normalizedSource);
  if (sourceRule?.enabled === false) return;
  const tags = AuthTag.append([method.toUpperCase()]);
  if ((responseStatus ?? 0) >= 400 || error) tags.push('failed');
  if (normalizedSource !== undefined) tags.push(normalizedSource);
  const content = buildClientRequestContent(
    {
      source,
      method,
      url,
      requestHeaders,
      responseStatus,
      duration,
      requestBody,
      responseHeaders,
      responseBody,
      error,
    },
    sourceRule,
    normalizedSource
  );
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
    if (!isWatcherEnabled(config.watchers.clientRequest)) return () => undefined;
    _storage = storage;
    _clientRequestWatcher =
      typeof config.watchers.clientRequest === 'object' && config.watchers.clientRequest !== null
        ? (config.watchers.clientRequest as TraceClientRequestWatcherConfig)
        : undefined;
    _redactHeaderNames = [...(config.redaction?.keys ?? []), ...(config.redaction?.headers ?? [])];
    _redactBodyFields = [...(config.redaction?.keys ?? []), ...(config.redaction?.body ?? [])];
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _clientRequestWatcher = undefined;
      _redactBodyFields = [];
      _ignoreRoutes = [];
    };
  },
});
