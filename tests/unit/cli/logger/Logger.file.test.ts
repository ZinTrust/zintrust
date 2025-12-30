import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ size: 0, mtime: new Date() }),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(),
};

vi.mock('@node-singletons/fs', () => fsMocks);
vi.mock('@node-singletons/path', () => ({ join: (...parts: string[]) => parts.join('/') }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('CLI Logger file behaviors', () => {
  it('rotates file when size exceeds max', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.statSync.mockReturnValue({ size: 1025, mtime: new Date() });

    const { Logger } = await import('@cli/logger/Logger');

    const logger = Logger.create('/tmp/logs', 1024, 'debug');
    logger.info('msg');

    // ensure rename was attempted due to size > max
    expect(fsMocks.renameSync).toHaveBeenCalled();
    expect(fsMocks.appendFileSync).toHaveBeenCalled();
  });

  it('getLogs returns parsed entries and respects limit', async () => {
    const lines =
      [JSON.stringify({ message: 'one' }), JSON.stringify({ message: 'two' })].join('\n') + '\n';
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.readFileSync.mockReturnValue(lines);

    const { Logger } = await import('@cli/logger/Logger');
    const logger = Logger.create('/tmp/logs', 1024, 'debug');

    const logs = logger.getLogs('app', 1);
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('two'); // reversed order, newest first
  });

  it('clearLogs returns true when file existed and was removed', async () => {
    fsMocks.existsSync.mockReturnValue(true);
    const { Logger } = await import('@cli/logger/Logger');
    const logger = Logger.create('/tmp/logs', 1024, 'debug');

    const result = logger.clearLogs('app');
    expect(result).toBe(true);
    expect(fsMocks.unlinkSync).toHaveBeenCalled();
  });

  it('clearLogs returns false when file missing', async () => {
    fsMocks.existsSync.mockReturnValue(false);
    const { Logger } = await import('@cli/logger/Logger');
    const logger = Logger.create('/tmp/logs', 1024, 'debug');

    const result = logger.clearLogs('app');
    expect(result).toBe(false);
  });
});
