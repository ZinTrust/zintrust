/**
 * FileLogWriter (Node.js only)
 *
 * Provides best-effort file logging with daily + size-based rotation.
 * Uses async write streams to avoid blocking the event loop.
 */

import { ensureDirSafe } from '@common/index';
import { Env } from '@config/env';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import type { PathLike, WriteStream, WriteStreamOptions } from 'node:fs';

// Write stream cache to avoid recreating streams
const streamCache = new Map<string, WriteStream>();
const pendingWrites = new Map<string, string[]>();

const canUseWriteStreams = (): boolean => {
  try {
    // Vitest's ESM module mocks can throw when accessing missing exports.
    // Treat missing createWriteStream as "no stream support".
    return (
      typeof (fs as unknown as { createWriteStream?: unknown }).createWriteStream === 'function'
    );
  } catch {
    return false;
  }
};

const appendFileSafe = (logFile: string, content: string): void => {
  try {
    // Some tests/mock environments provide only appendFileSync (no streams).
    fs.appendFileSync(logFile, content);
  } catch {
    // best-effort
  }
};

const getCwdSafe = (): string => {
  try {
    if (typeof process === 'undefined' || typeof process.cwd !== 'function') return '';
    return process.cwd();
  } catch {
    return '';
  }
};

const getDateStr = (d: Date): string => d.toISOString().slice(0, 10);

const isAppLogFile = (fileName: string): boolean =>
  fileName.startsWith('app-') && fileName.endsWith('.log');

const parseDateFromLogFilename = (fileName: string): number | null => {
  const match = /^app-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.log$/.exec(fileName);
  if (match?.[1] === undefined) return null;

  const parsed = Date.parse(`${match[1]}T00:00:00.000Z`);
  return Number.isNaN(parsed) ? null : parsed;
};

const isOlderThanCutoffByMtime = (fullPath: string, cutoff: number): boolean => {
  try {
    const stat = fs.statSync(fullPath);
    return stat.mtime.getTime() < cutoff;
  } catch {
    return false;
  }
};

const safeUnlink = (fullPath: string): void => {
  try {
    fs.unlinkSync(fullPath);
  } catch {
    // best-effort
  }
};

const readDirSafe = (dirPath: string): string[] => {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
};

const shouldDeleteLogFile = (fileName: string, fullPath: string, cutoff: number): boolean => {
  const parsed = parseDateFromLogFilename(fileName);
  if (parsed !== null) return parsed < cutoff;

  return isOlderThanCutoffByMtime(fullPath, cutoff);
};

const cleanupOldLogs = (logsDir: string, keepDays: number): void => {
  if (keepDays <= 0) return;

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const files = readDirSafe(logsDir);
  if (files.length === 0) return;

  for (const fileName of files) {
    if (!isAppLogFile(fileName)) continue;

    const fullPath = path.join(logsDir, fileName);
    if (!shouldDeleteLogFile(fileName, fullPath, cutoff)) continue;

    safeUnlink(fullPath);
  }
};

type CleanOnceOptions = {
  logsDir?: string;
  keepDays?: number;
  maxTotalSize?: number;
  keepFiles?: number;
};

const listAppLogFiles = (
  logsDir: string,
  order: 'newest-first' | 'oldest-first'
): Array<{ name: string; path: string }> => {
  const files = readDirSafe(logsDir)
    .filter((f) => isAppLogFile(f))
    .map((f) => ({ name: f, path: path.join(logsDir, f) }));

  return files.sort((a, b) => {
    if (a.name === b.name) return 0;
    const newerFirst = a.name < b.name ? 1 : -1;
    return order === 'newest-first' ? newerFirst : -newerFirst;
  });
};

const enforceKeepFilesPolicy = (
  filesNewestFirst: Array<{ name: string; path: string }>,
  keepFiles: number | undefined,
  deleted: string[]
): void => {
  if (typeof keepFiles !== 'number' || keepFiles < 0) return;
  if (filesNewestFirst.length <= keepFiles) return;

  const toDelete = filesNewestFirst.slice(keepFiles);
  for (const f of toDelete) {
    safeUnlink(f.path);
    deleted.push(f.path);
  }
};

const getFileSizesTotal = (
  filesOldestFirst: Array<{ name: string; path: string }>
): { total: number; sizes: Array<{ path: string; size: number }> } => {
  let total = 0;
  const sizes: Array<{ path: string; size: number }> = [];

  for (const file of filesOldestFirst) {
    try {
      const stat = fs.statSync(file.path);
      sizes.push({ path: file.path, size: stat.size });
      total += stat.size;
    } catch {
      // ignore
    }
  }

  return { total, sizes };
};

const deleteOldestUntilWithinLimit = (
  sizesOldestFirst: Array<{ path: string; size: number }>,
  maxTotalSize: number,
  deleted: string[],
  initialTotal: number
): void => {
  let total = initialTotal;

  let idx = 0;
  while (total > maxTotalSize && idx < sizesOldestFirst.length) {
    const del = sizesOldestFirst[idx];
    safeUnlink(del.path);
    deleted.push(del.path);
    total -= del.size;
    idx++;
  }
};

const enforceMaxTotalSizePolicy = (
  logsDir: string,
  maxTotalSize: number | undefined,
  deleted: string[]
): void => {
  if (typeof maxTotalSize !== 'number' || maxTotalSize <= 0) return;

  const remainingOldestFirst = listAppLogFiles(logsDir, 'oldest-first');
  const { total, sizes } = getFileSizesTotal(remainingOldestFirst);
  deleteOldestUntilWithinLimit(sizes, maxTotalSize, deleted, total);
};

/**
 * Clean log files with additional retention policies.
 * Returns an array of deleted file paths for auditing/tests.
 */
export const cleanOnce = (options?: CleanOnceOptions): string[] => {
  const cwd = getCwdSafe();
  if (cwd === '') return [];

  const logsDir = options?.logsDir ?? path.join(cwd, 'logs');
  const keepDays = options?.keepDays ?? Env.LOG_ROTATION_DAYS;
  const maxTotalSize = options?.maxTotalSize ?? Env.getInt('LOG_MAX_TOTAL_SIZE', 0);
  const keepFiles = options?.keepFiles ?? Env.getInt('LOG_KEEP_FILES', 0);

  // Step 1: delete by age
  cleanupOldLogs(logsDir, keepDays);

  const deleted: string[] = [];

  // Step 2: enforce keepFiles (keep newest N files)
  const filesNewestFirst = listAppLogFiles(logsDir, 'newest-first');
  enforceKeepFilesPolicy(filesNewestFirst, keepFiles, deleted);

  // Step 3: enforce max total size
  enforceMaxTotalSizePolicy(logsDir, maxTotalSize, deleted);

  return deleted;
};

const rotateIfNeeded = (logFile: string, maxSizeBytes: number): void => {
  if (maxSizeBytes <= 0) return;

  try {
    if (!fs.existsSync(logFile)) return;

    const stat = fs.statSync(logFile);
    if (stat.size <= maxSizeBytes) return;

    // Close and clear existing stream before rotation
    const stream = streamCache.get(logFile);
    if (stream !== undefined) {
      stream.end();
      streamCache.delete(logFile);
    }

    const ext = '.log';
    const base = logFile.endsWith(ext) ? logFile.slice(0, -ext.length) : logFile;
    const rotated = `${base}-${Date.now()}${ext}`;
    fs.renameSync(logFile, rotated);
  } catch {
    // best-effort
  }
};

const getOrCreateStream = (logFile: string): WriteStream => {
  let stream = streamCache.get(logFile);

  if (stream === undefined || stream.destroyed) {
    type CreateWriteStream = (path: PathLike, options: WriteStreamOptions) => WriteStream;

    const createWriteStream = (fs as unknown as { createWriteStream: CreateWriteStream })
      .createWriteStream;

    stream = createWriteStream(logFile, { flags: 'a', encoding: 'utf-8' });

    // Clean up on error
    stream.on('error', () => {
      streamCache.delete(logFile);
    });

    streamCache.set(logFile, stream);
  }

  return stream;
};

const flushPendingWrites = (logFile: string): void => {
  const pending = pendingWrites.get(logFile);
  if (pending === undefined || pending.length === 0) return;

  const lines = pending.join('');

  if (!canUseWriteStreams()) {
    appendFileSafe(logFile, lines);
    pendingWrites.delete(logFile);
    return;
  }

  const stream = getOrCreateStream(logFile);

  stream.write(lines, (error: Error | null | undefined) => {
    if (error !== null && error !== undefined) {
      // Silent failure for best-effort logging
    }
  });

  pendingWrites.delete(logFile);
};

export const FileLogWriter = Object.freeze({
  write(line: string): void {
    const cwd = getCwdSafe();
    if (cwd === '') return;

    const logsDir = path.join(cwd, 'logs');
    ensureDirSafe(logsDir);

    const dateStr = getDateStr(new Date());
    const logFile = path.join(logsDir, `app-${dateStr}.log`);

    rotateIfNeeded(logFile, Env.LOG_ROTATION_SIZE);

    // In test environments we sometimes mock @node-singletons/fs without stream APIs.
    // Fall back to synchronous append to avoid runtime crashes.
    if (!canUseWriteStreams()) {
      appendFileSafe(logFile, `${line}\n`);
      cleanupOldLogs(logsDir, Env.LOG_ROTATION_DAYS);
      return;
    }

    try {
      // Buffer writes for async processing
      const pending = pendingWrites.get(logFile) ?? [];
      pending.push(`${line}\n`);
      pendingWrites.set(logFile, pending);

      // Flush on next tick to batch multiple rapid writes
      process.nextTick(() => flushPendingWrites(logFile));
    } catch {
      // best-effort
      return;
    }

    cleanupOldLogs(logsDir, Env.LOG_ROTATION_DAYS);
  },

  // Flush all streams (for graceful shutdown)
  flush(): void {
    for (const [logFile, stream] of streamCache.entries()) {
      flushPendingWrites(logFile);
      stream.end();
    }
    streamCache.clear();
    pendingWrites.clear();
  },
});

export default FileLogWriter;
