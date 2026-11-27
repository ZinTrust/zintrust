import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  env: {
    LOG_ROTATION_DAYS: 7,
    LOG_MAX_TOTAL_SIZE: 100,
    LOG_KEEP_FILES: 2,
    LOG_ROTATION_SIZE: 50,
  } as Record<string, unknown>,
  appendFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ mtime: new Date('2020-01-01T00:00:00Z'), size: 10 })),
  readdirSync: vi.fn(() => [] as unknown),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
  ensureDirSafe: vi.fn(),
  createWriteStream: undefined as unknown,
  streamWrite: vi.fn((_lines: string, cb?: (error?: Error | null) => void) => cb?.(null)),
  streamEnd: vi.fn(),
}));

vi.mock('@config/env', () => ({
  Env: {
    get LOG_ROTATION_DAYS() { return m.env['LOG_ROTATION_DAYS']; },
    get LOG_ROTATION_SIZE() { return m.env['LOG_ROTATION_SIZE']; },
    getInt: (key: string, fallback = 0) => m.env[key] ?? fallback,
  },
}));

vi.mock('@common/index', () => ({
  ensureDirSafe: (...args: unknown[]) => m.ensureDirSafe(...args),
}));

vi.mock('@node-singletons/fs', () => ({
  appendFileSync: (...args: unknown[]) => m.appendFileSync(...args),
  existsSync: (...args: unknown[]) => (m.existsSync as (...a: any[]) => any)(...args),
  statSync: (...args: unknown[]) => (m.statSync as (...a: any[]) => any)(...args),
  readdirSync: (...args: unknown[]) => (m.readdirSync as (...a: any[]) => any)(...args),
  unlinkSync: (...args: unknown[]) => m.unlinkSync(...args),
  renameSync: (...args: unknown[]) => m.renameSync(...args),
  mkdirSync: (...args: unknown[]) => m.mkdirSync(...args),
  createWriteStream: (...args: unknown[]) =>
    (m.createWriteStream as (...inner: unknown[]) => unknown)(...args),
}));

const load = async () => {
  vi.resetModules();
  const { FileLogWriter } = await import('@/config/FileLogWriter');
  return FileLogWriter;
};

const useStreams = () => {
  m.streamWrite.mockImplementation((_lines, cb) => cb?.(null));
  m.streamEnd.mockClear();
  m.createWriteStream = vi.fn(() => ({
    write: (...args: Parameters<typeof m.streamWrite>) => m.streamWrite(...args),
    end: (...args: unknown[]) => m.streamEnd(...args),
    destroyed: false,
    on: vi.fn(),
  }));
};

const noStreams = () => {
  m.createWriteStream = undefined;
};

describe('FileLogWriter remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.env = {
      LOG_ROTATION_DAYS: 7,
      LOG_MAX_TOTAL_SIZE: 100,
      LOG_KEEP_FILES: 2,
      LOG_ROTATION_SIZE: 50,
    };
    m.existsSync.mockReturnValue(true);
    m.statSync.mockReturnValue({ mtime: new Date('2020-01-01T00:00:00Z'), size: 10 });
    m.readdirSync.mockReturnValue([]);
    useStreams();
    for (const key of ['CF', 'caches', 'WebSocketPair'] as const) {
      Reflect.deleteProperty(globalThis, key);
    }
  });

  afterEach(() => {
    for (const key of ['CF', 'caches', 'WebSocketPair'] as const) {
      Reflect.deleteProperty(globalThis, key);
    }
    vi.restoreAllMocks();
  });

  it('buffers stream writes, handles callback errors, and recreates destroyed streams', async () => {
    const FileLogWriter = await load();
    const streamFn = m.createWriteStream as ReturnType<typeof vi.fn>;

    expect(FileLogWriter.write('first')).toBe(true);
    expect(FileLogWriter.write('second')).toBe(true);
    await new Promise((resolve) => process.nextTick(resolve));
    expect(m.streamWrite).toHaveBeenCalledWith(expect.stringContaining('first'), expect.any(Function));

    const cb = m.streamWrite.mock.calls[0]?.[1] as (error: Error | null) => void;
    expect(() => cb(new Error('write failed'))).not.toThrow();
    expect(() => cb(null)).not.toThrow();

    const stream = streamFn.mock.results[0]?.value as { destroyed: boolean } | undefined;
    if (stream !== undefined) stream.destroyed = true;
    expect(FileLogWriter.write('third')).toBe(true);
    await new Promise((resolve) => process.nextTick(resolve));
    expect(streamFn).toHaveBeenCalledTimes(2);

    FileLogWriter.flush();
    expect(m.streamEnd).toHaveBeenCalled();
  });

  it('falls back to appendFileSync when streams are unavailable', async () => {
    noStreams();
    const FileLogWriter = await load();
    expect(FileLogWriter.write('plain')).toBe(true);
    await new Promise((resolve) => process.nextTick(resolve));
    expect(m.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('app-'), 'plain\n');
  });

  it('falls back to mkdirSync when ensureDirSafe is unavailable or throws', async () => {
    vi.resetModules();
    vi.doMock('@common/index', () => ({ ensureDirSafe: undefined }));
    const WithoutEnsure = (await import('@/config/FileLogWriter')).FileLogWriter;
    expect(WithoutEnsure.write('x')).toBe(true);
    expect(m.mkdirSync).toHaveBeenCalled();

    m.ensureDirSafe.mockImplementationOnce(() => {
      throw new Error('ensure failed');
    });
    const FileLogWriter = await load();
    expect(FileLogWriter.write('y')).toBe(true);
    expect(m.mkdirSync).toHaveBeenCalled();
  });

  it('returns false in Workers runtimes and when cwd cannot be resolved', async () => {
    (globalThis as unknown as { CF: unknown }).CF = {};
    const workersWriter = await load();
    expect(workersWriter.write('ignored')).toBe(false);
    expect(m.appendFileSync).not.toHaveBeenCalled();
    expect(workersWriter.flush()).toBeUndefined();

    delete (globalThis as unknown as Record<string, unknown>)['CF'];
    vi.spyOn(process, 'cwd').mockImplementationOnce(() => {
      throw new Error('no cwd');
    });
    const FileLogWriter = await load();
    expect(FileLogWriter.write('ignored')).toBe(false);
  });

  it('rotates files by size, including files without a .log extension', async () => {
    m.statSync.mockReturnValue({ mtime: new Date('2020-01-01T00:00:00Z'), size: 500 });
    m.existsSync.mockReturnValue(true);
    const FileLogWriter = await load();
    expect(FileLogWriter.write('after rotation')).toBe(true);
    expect(m.renameSync).toHaveBeenCalledWith(
      expect.stringContaining('app-'),
      expect.stringContaining('-')
    );

    m.env['LOG_ROTATION_SIZE'] = 0;
    m.renameSync.mockClear();
    const NoRotation = await load();
    NoRotation.write('no rotation');
    expect(m.renameSync).not.toHaveBeenCalled();
  });

  it('cleans old logs by filename, mtime, keepFiles and max total size', async () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    m.readdirSync.mockImplementation((dir: unknown) => {
      if (String(dir).includes('logs')) {
        return [
          `app-${oldDate}.log`,
          'app-9999-99-99.log',
          'app-2020-01-01-2.log',
          'unrelated.txt',
        ];
      }
      return [];
    });
    m.statSync.mockImplementation((target: unknown) => ({
      mtime: String(target).includes('9999')
        ? new Date(0)
        : new Date('2020-01-01T00:00:00Z'),
      size: 60,
    }));

    const FileLogWriter = await load();
    FileLogWriter.write('entry');
    expect(m.unlinkSync).toHaveBeenCalledWith(expect.stringContaining(`app-${oldDate}.log`));
    expect(m.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('app-9999-99-99.log'));

    const deleted = FileLogWriter.flush();
    expect(deleted).toBeUndefined();

    m.unlinkSync.mockClear();
    m.env['LOG_KEEP_FILES'] = 0;
    m.env['LOG_MAX_TOTAL_SIZE'] = 50;
    const withPolicies = await load();
    withPolicies.write('entry');
    expect(m.unlinkSync).toHaveBeenCalled();
  });

  it('uses Env defaults for cleanOnce and tolerates readdir failures', async () => {
    const module = await import('@/config/FileLogWriter');
    m.readdirSync.mockReturnValueOnce(['app-2020-01-01.log', 'app-2020-01-01.log']);
    expect(module.cleanOnce()).toEqual([]);

    m.readdirSync.mockImplementationOnce(() => {
      throw new Error('readdir failed');
    });
    expect(module.cleanOnce({ logsDir: '/logs', keepDays: 3, maxTotalSize: 50, keepFiles: 1 })).toEqual(
      []
    );
  });

  it('uses the append fallback for pending writes when streams disappear', async () => {
    const FileLogWriter = await load();
    expect(FileLogWriter.write('buffered')).toBe(true);
    noStreams();
    await new Promise((resolve) => process.nextTick(resolve));
    expect(m.appendFileSync).toHaveBeenCalledWith(expect.stringContaining('app-'), 'buffered\n');
  });

  it('skips appendFileSafe for pending writes in a Workers runtime', async () => {
    const FileLogWriter = await load();
    expect(FileLogWriter.write('buffered')).toBe(true);
    (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = {};
    await new Promise((resolve) => process.nextTick(resolve));
    expect(m.appendFileSync).not.toHaveBeenCalled();
  });

  it('handles non-array readdir results, invalid retention and empty keep policies', async () => {
    m.readdirSync.mockReturnValue('not-an-array');
    m.env['LOG_KEEP_FILES'] = -1;
    m.env['LOG_MAX_TOTAL_SIZE'] = 0;
    m.env['LOG_ROTATION_DAYS'] = 0;
    const FileLogWriter = await load();
    expect(FileLogWriter.write('entry')).toBe(true);

    m.readdirSync.mockReturnValue(['app-2020-01-01.log', 'app-2020-01-01.log']);
    m.env['LOG_KEEP_FILES'] = 1;
    const withDuplicates = await load();
    expect(withDuplicates.write('entry')).toBe(true);
  });
});
