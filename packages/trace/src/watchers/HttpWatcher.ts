/**
 * HttpWatcher — records inbound HTTP requests as trace entries.
 * Registers as a global middleware via Kernel.registerGlobalMiddleware().
 */
import type { IRequest, IResponse } from '@zintrust/core';
import { Logger } from '@zintrust/core';
import { TraceContext } from '../context';
import type { ITraceConfig, ITraceWatcher, ITraceWatcherConfig, RequestContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactHeaders, redactObject, redactUnknown } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

const normalizeHeaders = (headers: IRequest['headers']): Record<string, string> => {
  if (!headers) return {};

  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (typeof value === 'string') return [[key, value]];
      if (Array.isArray(value)) return [[key, value.join(', ')]];
      return [];
    })
  );
};

const normalizeHeaderValue = (value: string | string[]): string => {
  return Array.isArray(value) ? value.join(', ') : value;
};

const resolveRouteMiddleware = (req: IRequest): string[] => {
  const middleware = req.context?.['traceRouteMiddleware'];
  return Array.isArray(middleware)
    ? middleware.filter((value): value is string => typeof value === 'string')
    : [];
};

const resolveRequestPayload = (req: IRequest, config: ITraceConfig): unknown => {
  const redactFields = [...config.redaction.keys, ...config.redaction.body];
  const requestBody = typeof req.getBody === 'function' ? req.getBody() : req.body;

  if (requestBody === undefined || requestBody === null) return {};
  if (typeof requestBody === 'object') {
    return redactObject(requestBody as Record<string, unknown>, redactFields);
  }

  return redactUnknown(requestBody, redactFields);
};

type ResponseCapture = {
  headers: Record<string, string>;
  body?: unknown;
  restore(): void;
};

type RawResponseWithLifecycle = ReturnType<IResponse['getRaw']> & {
  once?: (event: 'finish' | 'close', listener: () => void) => unknown;
  off?: (event: 'finish' | 'close', listener: () => void) => unknown;
  writableEnded?: boolean;
  finished?: boolean;
};

type CompletionHandlerRegistration = {
  attached: boolean;
  cleanup(): void;
};

const registerCompletionHandler = (
  response: IResponse,
  onComplete: () => void
): CompletionHandlerRegistration => {
  const raw: RawResponseWithLifecycle = response.getRaw();
  if (typeof raw.once !== 'function') {
    return { attached: false, cleanup: () => undefined };
  }

  let completed = false;

  const cleanup = (): void => {
    if (typeof raw.off === 'function') {
      raw.off('finish', markCompleted);
      raw.off('close', markCompleted);
    }
  };

  const markCompleted = (): void => {
    if (completed) return;
    completed = true;
    cleanup();
    onComplete();
  };

  raw.once('finish', markCompleted);
  raw.once('close', markCompleted);

  return { attached: true, cleanup };
};

const isResponseComplete = (response: IResponse): boolean => {
  const raw: RawResponseWithLifecycle = response.getRaw();
  return raw.writableEnded === true || raw.finished === true;
};

const captureResponse = (response: IResponse, config: ITraceConfig): ResponseCapture => {
  const headers: Record<string, string> = {};
  const redactFields = [...config.redaction.keys, ...config.redaction.body];

  const originalSetHeader = response.setHeader;
  const originalJson = response.json;
  const originalText = response.text;
  const originalHtml = response.html;
  const originalSend = response.send;

  const capture: ResponseCapture = {
    headers,
    body: undefined,
    restore(): void {
      response.setHeader = originalSetHeader;
      response.json = originalJson;
      response.text = originalText;
      response.html = originalHtml;
      response.send = originalSend;
    },
  };

  response.setHeader = function setHeader(name: string, value: string | string[]): IResponse {
    headers[name] = normalizeHeaderValue(value);
    return originalSetHeader.call(this, name, value);
  };

  response.json = function json(data: unknown): void {
    capture.body = redactUnknown(data, redactFields);
    originalJson.call(this, data);
  };

  response.text = function text(value: string): void {
    capture.body = value;
    originalText.call(this, value);
  };

  response.html = function html(value: string): void {
    capture.body = value;
    originalHtml.call(this, value);
  };

  response.send = function send(data: string | Buffer): void {
    capture.body = typeof data === 'string' ? data : `[binary ${data.length} bytes]`;
    originalSend.call(this, data);
  };

  return capture;
};

const buildEntry = (
  req: IRequest,
  res: IResponse,
  start: number,
  config: ITraceConfig,
  responseCapture: ResponseCapture
): RequestContent => {
  const headers = redactHeaders(normalizeHeaders(req.headers), [
    ...config.redaction.keys,
    ...config.redaction.headers,
  ]);

  return {
    method: req.getMethod(),
    uri: req.getPath(),
    headers,
    payload: resolveRequestPayload(req, config),
    responseStatus: res.getStatus(),
    responseHeaders: redactHeaders(responseCapture.headers, [
      ...config.redaction.keys,
      ...config.redaction.headers,
    ]),
    responseBody: responseCapture.body,
    duration: Date.now() - start,
    memory: TraceContext.getMemory(),
    middleware: resolveRouteMiddleware(req),
    hostname: TraceContext.getHostname(),
    userId: TraceContext.getUserId(),
  };
};

const shouldIgnore = (req: IRequest, config: ITraceConfig): boolean => {
  return RequestFilter.matchesIgnoredPath(req.getPath(), config);
};

const isWatcherEnabled = (config: ITraceConfig): boolean => config.watchers.request !== false;

export const HttpWatcher: ITraceWatcher = Object.freeze({
  register({
    storage,
    config,
    registerMiddleware,
    scheduleBackgroundTask,
  }: ITraceWatcherConfig): () => void {
    if (!isWatcherEnabled(config)) return () => undefined;
    if (!registerMiddleware) return () => undefined;

    const middleware: Parameters<
      NonNullable<ITraceWatcherConfig['registerMiddleware']>
    >[0] = async (req: unknown, res: unknown, next: () => Promise<void>): Promise<void> => {
      const request = req as IRequest;
      const response = res as IResponse;

      if (shouldIgnore(request, config)) return next();

      const start = TraceContext.now();
      const batchId = TraceContext.getBatchId();
      const responseCapture = captureResponse(response, config);
      let didPersist = false;

      const persistEntry = (): void => {
        if (didPersist) return;
        didPersist = true;

        const content = buildEntry(request, response, start, config, responseCapture);
        const tags = AuthTag.append([]);
        if (content.responseStatus >= 500) tags.push('failed');

        responseCapture.restore();

        const entry = {
          uuid: crypto.randomUUID(),
          batchId,
          type: EntryType.REQUEST,
          content,
          tags,
          isLatest: true,
          createdAt: TraceContext.now(),
        };

        const writePromise = storage.writeEntry(entry).catch((error: unknown) => {
          Logger.warn('[trace] HttpWatcher writeEntry failed', {
            method: content.method,
            uri: content.uri,
            entryUuid: entry.uuid,
            error: error instanceof Error ? error.message : String(error),
          });
        });

        // Use background task scheduler if available (Workers waitUntil support)
        if (scheduleBackgroundTask) {
          scheduleBackgroundTask(writePromise);
        } else {
          // Fallback to fire-and-forget for backward compatibility
          writePromise.catch(() => undefined);
        }
      };

      const completionHandler = registerCompletionHandler(response, persistEntry);
      await next();

      if (!completionHandler.attached || isResponseComplete(response)) {
        persistEntry();
      }
    };

    registerMiddleware(middleware);
    return () => undefined;
  },
});
