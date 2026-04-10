import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  driveBusboy: undefined as
    | ((bb: EventEmitter, req: EventEmitter & { complete?: boolean }) => void)
    | undefined,
}));

vi.mock('busboy', () => ({
  default: vi.fn(() => new EventEmitter()),
}));

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const createRequest = (): EventEmitter & {
  headers: Record<string, string>;
  complete: boolean;
  pipe: (target: EventEmitter) => EventEmitter;
} => {
  const req = new EventEmitter() as EventEmitter & {
    headers: Record<string, string>;
    complete: boolean;
    pipe: (target: EventEmitter) => EventEmitter;
  };

  req.headers = {
    'content-type': 'multipart/form-data; boundary=----zintrust-test',
  };
  req.complete = false;
  req.pipe = (target: EventEmitter): EventEmitter => {
    queueMicrotask(() => {
      state.driveBusboy?.(target, req);
    });
    return target;
  };

  return req;
};

describe('registerStreamingMultipartParser', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const { MultipartParserRegistry } = await import('@zintrust/core');
    MultipartParserRegistry.clear();
    state.driveBusboy = undefined;
    vi.restoreAllMocks();
  });

  it('does not treat request close as an abort after the request completed', async () => {
    const { registerStreamingMultipartParser } =
      await import('../../src/registerStreamingMultipartParser');
    const { MultipartParserRegistry } = await import('@zintrust/core');

    registerStreamingMultipartParser({ filenamePrefix: 'multipart-test-' });
    const provider = MultipartParserRegistry.get();
    expect(provider).not.toBeNull();

    state.driveBusboy = (bb, req): void => {
      const fileStream = new PassThrough();
      bb.emit('field', 'title', 'avatar');
      bb.emit('file', 'photo', fileStream, {
        filename: 'avatar.txt',
        mimeType: 'text/plain',
        encoding: '7bit',
      });
      fileStream.end(Buffer.from('hello world'));
      req.complete = true;
      req.emit('close');
      setImmediate(() => bb.emit('finish'));
    };

    const parsed = await provider?.({
      req: createRequest() as never,
      contentType: 'multipart/form-data; boundary=----zintrust-test',
      limits: {
        maxFileSizeBytes: 1024 * 1024,
        maxFiles: 1,
        maxFields: 5,
        maxFieldSizeBytes: 1024,
      },
    });

    await flushAsync();

    expect(parsed?.fields).toEqual({ title: 'avatar' });
    expect(parsed?.files.photo).toHaveLength(1);
    expect(parsed?.files.photo?.[0]).toEqual(
      expect.objectContaining({
        fieldName: 'photo',
        originalName: 'avatar.txt',
        mimeType: 'text/plain',
      })
    );

    await parsed?.files.photo?.[0]?.cleanup();
  });

  it('still rejects when the request closes before completion', async () => {
    const { registerStreamingMultipartParser } =
      await import('../../src/registerStreamingMultipartParser');
    const { MultipartParserRegistry } = await import('@zintrust/core');

    registerStreamingMultipartParser({ filenamePrefix: 'multipart-test-' });
    const provider = MultipartParserRegistry.get();
    expect(provider).not.toBeNull();

    state.driveBusboy = (_bb, req): void => {
      req.complete = false;
      req.emit('close');
    };

    await expect(
      provider?.({
        req: createRequest() as never,
        contentType: 'multipart/form-data; boundary=----zintrust-test',
        limits: {
          maxFileSizeBytes: 1024 * 1024,
          maxFiles: 1,
          maxFields: 5,
          maxFieldSizeBytes: 1024,
        },
      })
    ).rejects.toThrow('Upload aborted');
  });
});
