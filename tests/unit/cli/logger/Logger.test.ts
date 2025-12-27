import { Logger } from '@/cli/logger/Logger';
import { promises as fs } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

const tmpDir = join(process.cwd(), 'tmp-test-logs');

describe('Logger', () => {
  beforeEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
    await fs.mkdir(tmpDir, { recursive: true });
  });

  it('writes logs and reads them back', async () => {
    const logger = Logger.create(tmpDir, 1024 * 10, 'debug');
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    // allow some time for async writes
    await new Promise((r) => setTimeout(r, 50));

    const logs = await logger.getLogs();
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.some((l) => l.message.includes('info message'))).toBe(true);

    const warnings = logger.filterByLevel(logs, 'warn');
    expect(warnings.every((w) => w.level === 'warn')).toBe(true);

    const now = new Date();
    const earlier = new Date(now.getTime() - 1000 * 60);
    const byDate = logger.filterByDateRange(logs, earlier, now);
    expect(Array.isArray(byDate)).toBe(true);

    await logger.clearLogs();
    const after = await logger.getLogs();
    expect(after.length).toBe(0);

    expect(logger.getLogsDirectory()).toBe(tmpDir);
    expect(logger.getLogLevel()).toBe('debug');
  });
});
