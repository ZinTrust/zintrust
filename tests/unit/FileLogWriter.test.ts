import fs from 'fs';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('FileLogWriter (no streams)', () => {
  it('falls back to appendFileSync when streams unavailable', async () => {
    vi.resetModules();

    const appendFileSync = vi.fn();

    vi.doMock('@node-singletons/fs', () => ({
      appendFileSync,
      existsSync: (_p: string) => true,
      statSync: (_p: string) => ({ mtime: new Date(), size: 0 }),
      readdirSync: (_p: string) => [],
      unlinkSync: (_p: string) => {},
      renameSync: (_a: string, _b: string) => {},
    }));

    const cwd = path.join(__dirname, '../fixtures/fs-cwd');
    fs.mkdirSync(path.join(cwd, 'logs'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    const { FileLogWriter } = await import('../../src/config/FileLogWriter');

    FileLogWriter.write('hello world');

    expect(appendFileSync).toHaveBeenCalled();
  });
});

describe('FileLogWriter (with streams)', () => {
  it('buffers and flushes pending writes using streams', async () => {
    vi.resetModules();

    const writeSpy = vi.fn((_lines: string, cb: (err?: Error | null) => void) => cb(null));
    const createWriteStream = vi.fn(() => ({
      write: writeSpy,
      end: vi.fn(),
      destroyed: false,
      on: vi.fn(),
    }));

    vi.doMock('@node-singletons/fs', () => ({
      createWriteStream,
      statSync: (_p: string) => ({ mtime: new Date(), size: 0 }),
      readdirSync: (_p: string) => [],
      unlinkSync: (_p: string) => {},
      renameSync: (_a: string, _b: string) => {},
      appendFileSync: vi.fn(),
    }));

    const cwd = path.join(__dirname, '../fixtures/fs-cwd-2');
    fs.mkdirSync(path.join(cwd, 'logs'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    const { FileLogWriter } = await import('../../src/config/FileLogWriter');

    FileLogWriter.write('one');

    // Wait for next tick where flushPendingWrites runs
    await new Promise((r) => process.nextTick(r));

    expect(writeSpy).toHaveBeenCalled();
  });
});
