import { describe, expect, it, vi } from 'vitest';

const mockState = {
  controller: null as ReadableStreamDefaultController<Uint8Array> | null,
  close: null as (() => void) | null,
};

vi.mock('cloudflare:sockets', () => {
  const connect = () => {
    mockState.controller = null;
    mockState.close = null;

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        mockState.controller = controller;
      },
    });

    const writable = new WritableStream<Uint8Array>({
      write() {
        // noop
      },
    });

    const closed = new Promise<void>((resolve) => {
      mockState.close = resolve;
    });

    const socket = {
      readable,
      writable,
      opened: Promise.resolve({}),
      closed,
      startTls: () => socket,
      close: () => {
        mockState.close?.();
        return Promise.resolve();
      },
    };

    return socket;
  };

  return { connect };
});

import { CloudflareSocket } from '@zintrust/core';

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const waitForConnect = async (socket: { once: (event: string, cb: () => void) => void }) =>
  new Promise<void>((resolve) => socket.once('connect', () => resolve()));

describe('CloudflareSocket (db-postgres)', () => {
  it('emits connect and data events', async () => {
    const socket = CloudflareSocket.create('localhost', 5432);
    const dataEvents: Buffer[] = [];
    let connected = false;

    socket.on('connect', () => {
      connected = true;
    });

    socket.on('data', (data: Buffer) => {
      dataEvents.push(data);
    });

    await waitForConnect(socket);

    mockState.controller?.enqueue(new Uint8Array([1, 2, 3]));
    await flushMicrotasks();

    expect(connected).toBe(true);
    expect(dataEvents).toHaveLength(1);
    expect([...dataEvents[0]]).toEqual([1, 2, 3]);
  });

  it('buffers while paused and flushes on resume', async () => {
    const socket = CloudflareSocket.create('localhost', 5432);
    const dataEvents: Buffer[] = [];

    socket.on('data', (data: Buffer) => {
      dataEvents.push(data);
    });

    await waitForConnect(socket);

    socket.pause();
    mockState.controller?.enqueue(new Uint8Array([9]));
    await flushMicrotasks();

    expect(dataEvents).toHaveLength(0);

    socket.resume();
    await flushMicrotasks();

    expect(dataEvents).toHaveLength(1);
    expect([...dataEvents[0]]).toEqual([9]);
  });

  it('emits fragmented data chunks separately', async () => {
    const socket = CloudflareSocket.create('localhost', 5432);
    const dataEvents: Buffer[] = [];

    socket.on('data', (data: Buffer) => {
      dataEvents.push(data);
    });

    await waitForConnect(socket);

    mockState.controller?.enqueue(new Uint8Array([4, 5]));
    mockState.controller?.enqueue(new Uint8Array([6, 7]));
    await flushMicrotasks();

    expect(dataEvents).toHaveLength(2);
    expect([...dataEvents[0]]).toEqual([4, 5]);
    expect([...dataEvents[1]]).toEqual([6, 7]);
  });

  it('cleans listeners on end', async () => {
    const socket = CloudflareSocket.create('localhost', 5432);
    const handler = () => undefined;

    socket.on('data', handler);
    socket.on('error', handler);

    await waitForConnect(socket);
    socket.end();
    await flushMicrotasks();

    expect(socket.listenerCount('data')).toBe(0);
    expect(socket.listenerCount('error')).toBe(0);
  });

  it('writes buffers without throwing', async () => {
    const socket = CloudflareSocket.create('localhost', 5432);

    await flushMicrotasks();

    const bufferResult = socket.write(Buffer.from([1, 2, 3]));
    const uintResult = socket.write(new Uint8Array([4, 5, 6]));

    expect(bufferResult).toBeTypeOf('boolean');
    expect(uintResult).toBeTypeOf('boolean');
  });

  it('emits error when stream errors', async () => {
    const socket = CloudflareSocket.create('localhost', 5432);
    const errors: Error[] = [];

    socket.on('error', (error: Error) => {
      errors.push(error);
    });

    await waitForConnect(socket);
    const error = new Error('stream failure');
    mockState.controller?.error(error);
    await flushMicrotasks();

    expect(errors.length).toBeGreaterThan(0);
  });
});
