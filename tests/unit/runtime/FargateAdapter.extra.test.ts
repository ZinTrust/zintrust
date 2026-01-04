import { describe, expect, it, vi } from 'vitest';

import type { IncomingMessage } from '@node-singletons/http';

async function importAdapter() {
  return import('@/runtime/adapters/FargateAdapter');
}

describe('FargateAdapter - helpers', () => {
  it('readIncomingMessageBody collects chunks and returns Buffer', async () => {
    const { readIncomingMessageBody } = await importAdapter();

    const req = {
      on: (ev: string, cb: (...args: unknown[]) => void) => {
        if (ev === 'data') {
          // simulate two chunks
          setTimeout(() => cb(Buffer.from('he')));
          setTimeout(() => cb(Buffer.from('llo')));
        }
        if (ev === 'end') {
          setTimeout(() => cb());
        }
      },
    } as unknown as IncomingMessage;

    const res = await readIncomingMessageBody(req);
    expect(res).toBeInstanceOf(Buffer);
    expect(res?.toString('utf-8')).toBe('hello');
  });

  it('readIncomingMessageBody rejects on error', async () => {
    const { readIncomingMessageBody } = await importAdapter();

    const req = {
      on: (ev: string, cb: (...args: unknown[]) => void) => {
        if (ev === 'error') {
          setTimeout(() => cb(new Error('boom')));
        }
      },
    } as unknown as IncomingMessage;

    await expect(readIncomingMessageBody(req)).rejects.toThrow('boom');
  });

  it('normalizeError returns Error instance for string and non-error', async () => {
    const { normalizeError } = await importAdapter();

    const e1 = normalizeError(new Error('ok'));
    expect(e1).toBeInstanceOf(Error);
    expect(e1.message).toBe('ok');

    const e2 = normalizeError('simple');
    expect(e2).toBeInstanceOf(Error);
    expect(e2.message).toContain('simple');

    const e3 = normalizeError({ a: 1 } as any);
    expect(e3).toBeInstanceOf(Error);
    expect(e3.message).toContain('Unknown error');
  });

  it('stopFargateServer rejects and logs when close returns error', async () => {
    const { stopFargateServer } = await importAdapter();

    const err = new Error('close-fail');
    const fakeServer = {
      close: (cb: (err?: Error) => void) => cb(err),
    };

    const logger = { error: vi.fn() } as any;

    await expect(stopFargateServer({ server: fakeServer as any }, logger)).rejects.toThrow(
      'close-fail'
    );
    expect(logger.error).toHaveBeenCalledWith('Error closing server', err);
  });
});
