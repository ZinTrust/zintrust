import { TraceContext } from '../context';
import {
  EntryType,
  type ClientRequestContent,
  type ClientRequestTraceInput,
  type ITraceWatcher,
  type ITraceWatcherConfig,
  type TraceClientRequestCaptureRule,
  type TraceClientRequestWatcherConfig,
} from '../types';
import { AuthTag } from '../utils/authTag';
import { redactHeaders, redactUnknown } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _redactHeaderNames: string[] = [];
let _redactBodyFields: string[] = [];
let _ignoreRoutes: string[] = [];
let _ignorePath: string[] = [];
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

const applySource = (content: ClientRequestContent, normalizedSource: string | undefined): void => {
  if (normalizedSource !== undefined) {
    content.source = normalizedSource;
  }
};

const applyResponseStatus = (
  content: ClientRequestContent,
  responseStatus: number | undefined
): void => {
  if (responseStatus !== undefined) {
    content.responseStatus = responseStatus;
  }
};

const applyError = (content: ClientRequestContent, error: unknown): void => {
  if (typeof error === 'string' && error !== '') {
    content.error = error;
  }
};

const mergePartialContent = (
  content: ClientRequestContent,
  partial: Partial<ClientRequestContent>
): void => {
  Object.assign(content, partial);
};

const buildClientRequestContent = (
  input: ClientRequestTraceInput,
  sourceRule: TraceClientRequestCaptureRule | undefined,
  normalizedSource: string | undefined
): ClientRequestContent => {
  const content: ClientRequestContent = {
    method: input.method.toUpperCase(),
    url: input.url,
    requestHeaders: {},
    duration: input.duration,
    hostname: TraceContext.getHostname(),
  };

  applySource(content, normalizedSource);
  mergePartialContent(content, buildRequestHeaders(input.requestHeaders, sourceRule));
  mergePartialContent(content, buildRequestBody(input.requestBody, sourceRule));
  applyResponseStatus(content, input.responseStatus);
  mergePartialContent(content, buildResponseHeaders(input.responseHeaders, sourceRule));
  mergePartialContent(content, buildResponseBody(input.responseBody, sourceRule));
  applyError(content, input.error);

  return content;
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
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePath)) return;
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
        ? config.watchers.clientRequest
        : undefined;
    _redactHeaderNames = [...(config.redaction?.keys ?? []), ...(config.redaction?.headers ?? [])];
    _redactBodyFields = [...(config.redaction?.keys ?? []), ...(config.redaction?.body ?? [])];
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePath = config.ignorePath;
    return () => {
      _storage = null;
      _clientRequestWatcher = undefined;
      _redactBodyFields = [];
      _ignoreRoutes = [];
      _ignorePath = [];
    };
  },
});
