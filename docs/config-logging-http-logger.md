# HttpLogger config

- Source: `src/config/logging/HttpLogger.ts`

## Usage

Import from the framework:

```ts
import { HttpLogger } from '@zintrust/core';

// Example (if supported by the module):
// HttpLogger.*
```

## Snapshot (top)

```ts
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

import { delay, Env, ErrorFactory, HttpClient } from '@zintrust/core';

export type HttpLogEvent = {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  category?: string;
  data?: unknown;
  error?: string;
};

const isEnabled = (): boolean => Env.getBool('HTTP_LOG_ENABLED', false);

let buffer: HttpLogEvent[] = [];
let flushPromise: Promise\<void> | undefined;

const postBatch = async (events: HttpLogEvent[]): Promise\<void> => {
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

const flushNow = async (): Promise\<void> => {
  const toSend = buffer;
  buffer = [];

  if (!isEnabled()) return;
  if (toSend.length === 0) return;

  const maxRetries = 3;

  const attemptPost = async (attempt: number): Promise\<void> => {
    try {
      await postBatch(toSend);
    } catch {
      if (attempt >= maxRetries) return;
      const backoffMs = 100 * 2 ** attempt;
      await delay(backoffMs);
      await attemptPost(attempt + 1);
```

## Snapshot (bottom)

```ts
  const attemptPost = async (attempt: number): Promise\<void> => {
    try {
      await postBatch(toSend);
    } catch {
      if (attempt >= maxRetries) return;
      const backoffMs = 100 * 2 ** attempt;
      await delay(backoffMs);
      await attemptPost(attempt + 1);
    }
  };

  await attemptPost(0);
};

const scheduleFlush = async (): Promise\<void> => {
  if (flushPromise !== undefined) return flushPromise;

  const promise = new Promise\<void>((resolve) => {
    const run = async (): Promise\<void> => {
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
  async enqueue(event: HttpLogEvent): Promise\<void> {
    if (!isEnabled()) return Promise.resolve(); // NOSONAR

    buffer.push(event);

    const batchSize = Math.max(1, Env.getInt('HTTP_LOG_BATCH_SIZE', 50));
    if (buffer.length >= batchSize) {
      return scheduleFlush();
    }

    return scheduleFlush();
  },
});

export default HttpLogger;

```
