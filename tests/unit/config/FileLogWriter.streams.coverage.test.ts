import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

type FakeStream = {
  destroyed: boolean;
  on: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

const makeStream = (): FakeStream => {
  return {
    destroyed: false,
    on: vi.fn(),
    write: vi.fn((_data: string, cb?: (err?: Error | null) => void) => cb?.(null)),
    end: vi.fn(),
  };
};

describe('FileLogWriter (streams coverage)', () => {
  const originalCwd = process.cwd;

  let stream: FakeStream;
  let created = 0;

  const fsMocks = {
    existsSync: vi.fn<(path: string) => boolean>(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    createWriteStream: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    created = 0;
    stream = makeStream();

    fsMocks.createWriteStream.mockImplementation(() => {
      created++;
      return stream as any;
    });

    process.cwd = vi.fn(() => '/app');

    fsMocks.existsSync.mockImplementation((p: string) => {
      if (p === '/app') return true;
      if (p === '/app/logs') return true;
      return false;
    });
    fsMocks.readdirSync.mockReturnValue([]);
    fsMocks.statSync.mockReturnValue({ size: 0, mtime: new Date() } as any);

    vi.doMock('@node-singletons/fs', () => fsMocks);

    process.env['LOG_ROTATION_SIZE'] = '0';
    process.env['LOG_ROTATION_DAYS'] = '7';
  });

  afterEach(() => {
    process.cwd = originalCwd;
    delete process.env['LOG_ROTATION_SIZE'];
    delete process.env['LOG_ROTATION_DAYS'];
  });

  it('writes using createWriteStream and batches via nextTick', async () => {
    const { FileLogWriter } = await import('@config/FileLogWriter');

    FileLogWriter.write('line');

    // Let process.nextTick flush pending writes.
    await new Promise((resolve) => setImmediate(resolve));

    expect(created).toBe(1);
    expect(fsMocks.appendFileSync).not.toHaveBeenCalled();
    expect(stream.write).toHaveBeenCalledWith('line\n', expect.any(Function));
  });

  it('recreates stream if destroyed and cleans up cache on error', async () => {
    const { FileLogWriter } = await import('@config/FileLogWriter');

    FileLogWriter.write('a');
    await new Promise((resolve) => setImmediate(resolve));

    // Simulate stream error handler
    const errorHandler = (stream.on as any).mock.calls.find((c: any[]) => c[0] === 'error')?.[1];
    expect(errorHandler).toBeTypeOf('function');
    errorHandler?.();

    // Simulate destroyed stream forces recreation
    stream.destroyed = true;
    FileLogWriter.write('b');
    await new Promise((resolve) => setImmediate(resolve));

    expect(created).toBeGreaterThanOrEqual(2);
  });

  it('flush ends streams and clears buffers', async () => {
    const { FileLogWriter } = await import('@config/FileLogWriter');

    FileLogWriter.write('x');
    await new Promise((resolve) => setImmediate(resolve));

    FileLogWriter.flush();

    expect(stream.end).toHaveBeenCalled();
  });
});
