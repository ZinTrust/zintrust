import { cleanOnce } from '@config/FileLogWriter';
import * as fs from '@node-singletons/fs';
import os from '@node-singletons/os';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const tmpRoot = path.join(os.tmpdir(), 'zintrust-filelog-test');

beforeEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  fs.mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('FileLogWriter.cleanOnce (integration with real fs)', () => {
  it('returns [] when cwd is empty', () => {
    const origCwd = process.cwd;
    // @ts-ignore
    process.cwd = () => '';

    const deleted = cleanOnce({});
    expect(deleted).toEqual([]);

    // restore
    // @ts-ignore
    process.cwd = origCwd;
  });

  it('deletes old logs and enforces max total size and keepFiles', () => {
    const logsDir = path.join(tmpRoot, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Use deterministic old dates to avoid timezone/date math flakiness
    const files = [
      { name: 'app-2000-01-01.log', size: 100 },
      { name: 'app-2000-01-02.log', size: 200 },
      { name: 'app-2000-01-03.log', size: 500 },
    ];

    for (const f of files) {
      const p = path.join(logsDir, f.name);
      fs.writeFileSync(p, 'x'.repeat(f.size));
      // set mtime to some old dates
      fs.utimesSync(p, new Date('2000-01-04T00:00:00Z'), new Date('2000-01-04T00:00:00Z'));
    }

    // With keepDays large the age-based deletion won't remove files; we test keepFiles and maxTotalSize
    const deleted = cleanOnce({ logsDir, keepDays: 36500, maxTotalSize: 400, keepFiles: 2 });

    // Oldest file should be deleted to satisfy keepFiles/maxTotalSize policies
    expect(deleted.some((p) => p.includes(files[0].name))).toBeTruthy();
    expect(deleted.length).toBeGreaterThanOrEqual(1);

    // Now test fallback path where filename doesn't match pattern and mtime is used
    const broken = path.join(logsDir, 'app-broken.log');
    fs.writeFileSync(broken, 'x');
    // set old mtime
    fs.utimesSync(broken, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));

    // keepDays small but positive so age-based deletion will remove by mtime
    // Note: cleanupOldLogs removes files by age but does not include those paths in the
    // returned `deleted` array, so assert the file is actually removed from disk.
    cleanOnce({ logsDir, keepDays: 1, maxTotalSize: 100000, keepFiles: 10 });
    expect(fs.existsSync(broken)).toBeFalsy();
  });
});
