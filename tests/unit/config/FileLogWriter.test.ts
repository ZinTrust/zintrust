import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

const fsMocks = {
  existsSync: vi.fn<(path: string) => boolean>(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
};

vi.mock('@node-singletons/fs', () => fsMocks);

describe('FileLogWriter', () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-12-26T12:00:00.000Z'));

    fsMocks.existsSync.mockReset();
    fsMocks.mkdirSync.mockReset();
    fsMocks.appendFileSync.mockReset();
    fsMocks.readdirSync.mockReset();
    fsMocks.statSync.mockReset();
    fsMocks.renameSync.mockReset();
    fsMocks.unlinkSync.mockReset();

    process.cwd = vi.fn(() => '/app');

    process.env['LOG_ROTATION_SIZE'] = '10';
    process.env['LOG_ROTATION_DAYS'] = '7';

    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();

    // Restore process.cwd
    process.cwd = originalCwd;

    delete process.env['LOG_ROTATION_SIZE'];
    delete process.env['LOG_ROTATION_DAYS'];
  });

  it('rotates when the daily file exceeds LOG_ROTATION_SIZE', async () => {
    const now = Date.now();
    const logsDir = '/app/logs';
    const logFile = `${logsDir}/app-2025-12-26.log`;
    const rotated = `${logsDir}/app-2025-12-26-${now}.log`;

    fsMocks.existsSync.mockImplementation((p: string) => {
      if (p === logsDir) return true;
      if (p === logFile) return true;
      return false;
    });
    fsMocks.statSync.mockReturnValue({ size: 11, mtime: new Date() } as any);
    fsMocks.readdirSync.mockReturnValue([]);

    const { FileLogWriter } = await import('@config/FileLogWriter');
    FileLogWriter.write('line');

    expect(fsMocks.renameSync).toHaveBeenCalledWith(logFile, rotated);
    expect(fsMocks.appendFileSync).toHaveBeenCalledWith(logFile, 'line\n');
  });

  it('cleans up log files older than LOG_ROTATION_DAYS', async () => {
    const logsDir = '/app/logs';
    const logFile = `${logsDir}/app-2025-12-26.log`;

    fsMocks.existsSync.mockImplementation((p: string) => {
      if (p === logsDir) return true;
      if (p === logFile) return false;
      return false;
    });

    fsMocks.readdirSync.mockReturnValue(['app-2025-12-01.log', 'app-2025-12-20.log', 'notes.txt']);

    const { FileLogWriter } = await import('@config/FileLogWriter');
    FileLogWriter.write('line');

    expect(fsMocks.unlinkSync).toHaveBeenCalledWith(`${logsDir}/app-2025-12-01.log`);
    expect(fsMocks.unlinkSync).not.toHaveBeenCalledWith(`${logsDir}/app-2025-12-20.log`);
  });

  it('creates logs directory when missing', async () => {
    const logsDir = '/app/logs';

    fsMocks.existsSync.mockImplementation((p: string) => {
      if (p === logsDir) return false;
      return false;
    });
    fsMocks.readdirSync.mockReturnValue([]);

    const { FileLogWriter } = await import('@config/FileLogWriter');
    FileLogWriter.write('line');

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith(logsDir, { recursive: true });
  });
});
