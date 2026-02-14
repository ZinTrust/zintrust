import { describe, expect, it } from 'vitest';

import { createMockHttpObjects } from '@/runtime/RuntimeAdapter';

const readStreamText = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
};

describe('RuntimeAdapter extra branches', () => {
  it('creates event-stream body via TransformStream and writes chunks', async () => {
    const { res, responseData } = createMockHttpObjects({
      method: 'GET',
      path: '/events',
      headers: {},
    });

    (res as { writeHead: (code: number, headers?: Record<string, string>) => object }).writeHead(
      200,
      { 'content-type': 'text/event-stream' }
    );

    (res as { write: (chunk: string) => boolean }).write('data: one\n\n');
    (res as { end: (chunk?: string) => object }).end('data: two\n\n');

    expect(responseData.body).toBeInstanceOf(ReadableStream);
    const text = await readStreamText(responseData.body as ReadableStream<Uint8Array>);
    expect(text).toContain('data: one');
    expect(text).toContain('data: two');
  });

  it('closes event-stream writer on AbortSignal and emits close once', () => {
    const controller = new AbortController();
    const { res } = createMockHttpObjects({
      method: 'GET',
      path: '/events',
      headers: {},
      signal: controller.signal,
    });

    let closeCount = 0;
    (res as { once: (event: string, listener: () => void) => object }).once('close', () => {
      closeCount += 1;
    });

    (res as { writeHead: (code: number, headers?: Record<string, string>) => object }).writeHead(
      200,
      { 'content-type': 'text/event-stream' }
    );

    controller.abort();
    controller.abort();

    expect(closeCount).toBe(1);
  });

  it('uses remoteAddr over x-forwarded-for and supports removeListener', () => {
    const { req, res } = createMockHttpObjects({
      method: 'GET',
      path: '/hello',
      headers: { 'x-forwarded-for': '4.4.4.4' },
      remoteAddr: '7.7.7.7',
    });

    expect(req).toMatchObject({
      remoteAddress: '7.7.7.7',
      socket: { remoteAddress: '7.7.7.7' },
      connection: { remoteAddress: '7.7.7.7' },
    });

    let called = 0;
    const listener = (): void => {
      called += 1;
    };

    (res as { on: (event: string, listener: () => void) => object }).on('finish', listener);
    (res as { removeListener: (event: string, listener: () => void) => object }).removeListener(
      'finish',
      listener
    );
    (res as { emit: (event: string) => void }).emit('finish');

    expect(called).toBe(0);
  });
});
