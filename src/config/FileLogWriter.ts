/**
 * FileLogWriter (Node.js only)
 *
 * Provides best-effort file logging with daily + size-based rotation.
 * This module imports Node built-ins and should be loaded only in Node environments.
 */

import { Env } from '@config/env';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

const getCwdSafe = (): string => {
  try {
    if (typeof process === 'undefined' || typeof process.cwd !== 'function') return '';
    return process.cwd();
  } catch {
    return '';
  }
};

const ensureDir = (dirPath: string): void => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch {
    // best-effort
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

const rotateIfNeeded = (logFile: string, maxSizeBytes: number): void => {
  if (maxSizeBytes <= 0) return;

  try {
    if (!fs.existsSync(logFile)) return;

    const stat = fs.statSync(logFile);
    if (stat.size <= maxSizeBytes) return;

    const ext = '.log';
    const base = logFile.endsWith(ext) ? logFile.slice(0, -ext.length) : logFile;
    const rotated = `${base}-${Date.now()}${ext}`;
    fs.renameSync(logFile, rotated);
  } catch {
    // best-effort
  }
};

export const FileLogWriter = Object.freeze({
  write(line: string): void {
    const cwd = getCwdSafe();
    if (cwd === '') return;

    const logsDir = path.join(cwd, 'logs');
    ensureDir(logsDir);

    const dateStr = getDateStr(new Date());
    const logFile = path.join(logsDir, `app-${dateStr}.log`);

    rotateIfNeeded(logFile, Env.LOG_ROTATION_SIZE);

    try {
      fs.appendFileSync(logFile, `${line}\n`);
    } catch {
      // best-effort
      return;
    }

    cleanupOldLogs(logsDir, Env.LOG_ROTATION_DAYS);
  },
});

export default FileLogWriter;
