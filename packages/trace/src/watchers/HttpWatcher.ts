/**
 * HttpWatcher — records inbound HTTP requests as trace entries.
 * Registers as a global middleware via Kernel.registerGlobalMiddleware().
 */
import type { IRequest, IResponse } from '@zintrust/core';
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

type ResponseCapture = {
  headers: Record<string, string>;
  body?: unknown;
  restore(): void;
};

type RawResponseWithLifecycle = ReturnType<IResponse['getRaw']> & {
  once?: (event: 'finish' | 'close', listener: () => void) => unknown;
  off?: (event: 'finish' | 'close', listener: () => void) => unknown;
};

const registerCompletionHandler = (response: IResponse, onComplete: () => void): (() => void) => {
  const raw: RawResponseWithLifecycle = response.getRaw();
  if (typeof raw.once !== 'function') return () => undefined;

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

  return cleanup;
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

  const payload = req.body
    ? redactObject(req.body, [...config.redaction.keys, ...config.redaction.body])
    : {};

  return {
    method: req.getMethod(),
    uri: req.getPath(),
    headers,
    payload,
    responseStatus: res.getStatus(),
    responseHeaders: redactHeaders(responseCapture.headers, [
      ...config.redaction.keys,
      ...config.redaction.headers,
    ]),
    responseBody: responseCapture.body,
    duration: Date.now() - start,
    memory: TraceContext.getMemory(),
    middleware: [],
    hostname: TraceContext.getHostname(),
    userId: TraceContext.getUserId(),
  };
};

const shouldIgnore = (req: IRequest, config: ITraceConfig): boolean => {
  return RequestFilter.matchesIgnoredPath(req.getPath(), config.ignoreRoutes);
};

const isWatcherEnabled = (config: ITraceConfig): boolean => config.watchers.request !== false;

export const HttpWatcher: ITraceWatcher = Object.freeze({
  register({ storage, config, registerMiddleware }: ITraceWatcherConfig): () => void {
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

        storage
          .writeEntry({
            uuid: crypto.randomUUID(),
            batchId,
            type: EntryType.REQUEST,
            content,
            tags,
            isLatest: true,
            createdAt: TraceContext.now(),
          })
          .catch(() => undefined); // fire-and-forget
      };

      registerCompletionHandler(response, persistEntry);
      await next();
    };

    registerMiddleware(middleware);
    return () => undefined;
  },
});
