/**
 * HTTP Endpoint Logger
 * Sends logs to an external HTTP logging service.
 *
 * Enabled via env:
 *  - HTTP_LOG_ENABLED (default: false)
 *  - HTTP_LOG_ENDPOINT_URL
 *  - HTTP_LOG_BATCH_SIZE (default: 50)
 *  - HTTP_LOG_AUTH_TOKEN (optional)
 */

import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { HttpClient } from '@httpClient/Http';

export type HttpLogEvent = {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  category?: string;
  data?: unknown;
  error?: string;
};

const isEnabled = (): boolean => Env.getBool('HTTP_LOG_ENABLED', false);

const sleep = async (ms: number): Promise<void> => {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    if (typeof globalThis.setTimeout !== 'function') {
      resolve();
      return;
    }
    globalThis.setTimeout(() => resolve(), ms);
  });
};

let buffer: HttpLogEvent[] = [];
let flushPromise: Promise<void> | undefined;

const postBatch = async (events: HttpLogEvent[]): Promise<void> => {
  const endpoint = Env.get('HTTP_LOG_ENDPOINT_URL').trim();
  if (endpoint.length === 0) {
    throw ErrorFactory.createConfigError(
      'HTTP_LOG_ENDPOINT_URL is required when HTTP logging is enabled'
    );
  }

  const token = Env.get('HTTP_LOG_AUTH_TOKEN').trim();

  const builder = HttpClient.post(endpoint, {
    sentAt: new Date().toISOString(),
    count: events.length,
    events,
  });

  if (token.length > 0) {
    builder.withAuth(token, 'Bearer');
  }

  await builder.send();
};

const flushNow = async (): Promise<void> => {
  const toSend = buffer;
  buffer = [];

  if (!isEnabled()) return;
  if (toSend.length === 0) return;

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await postBatch(toSend);
      return;
    } catch {
      if (attempt === maxRetries) return;
      const backoffMs = 100 * 2 ** attempt;
      await sleep(backoffMs);
    }
  }
};

const scheduleFlush = async (): Promise<void> => {
  if (flushPromise !== undefined) return flushPromise;

  const promise = new Promise<void>((resolve) => {
    const run = async (): Promise<void> => {
      try {
        await flushNow();
      } finally {
        resolve(undefined);
      }
    };

    if (typeof globalThis.setTimeout !== 'function') {
      void run();
      return;
    }

    globalThis.setTimeout(() => {
      void run();
    }, 0);
  });

  flushPromise = promise.finally(() => {
    flushPromise = undefined;
  });

  return flushPromise;
};

export const HttpLogger = Object.freeze({
  async enqueue(event: HttpLogEvent): Promise<void> {
    if (!isEnabled()) return Promise.resolve();

    buffer.push(event);

    const batchSize = Math.max(1, Env.getInt('HTTP_LOG_BATCH_SIZE', 50));
    if (buffer.length >= batchSize) {
      return scheduleFlush();
    }

    return scheduleFlush();
  },
});

export default HttpLogger;
