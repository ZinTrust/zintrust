/**
 * File Generator
 * Handles creation of files and directories
 */

import { Logger } from '@config/logger';
import fs from 'node:fs';
import path from 'node:path';

export interface FileCreationOptions {
  overwrite?: boolean;
  createDirs?: boolean;
  encoding?: BufferEncoding;
}

/**
 * Create a directory recursively
 */
export function createDirectory(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      Logger.info(`Created directory: ${dirPath}`);
      return true;
    }
    return false;
  } catch (error) {
    Logger.error(`Failed to create directory ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Create multiple directories
 */
export function createDirectories(directories: string[], baseDir: string): void {
  for (const dir of directories) {
    const fullPath = path.join(baseDir, dir);
    createDirectory(fullPath);
  }
}

/**
 * Write file content
 */
export function writeFile(
  filePath: string,
  content: string,
  options: FileCreationOptions = {}
): boolean {
  const { overwrite = false, createDirs = true, encoding = 'utf-8' } = options;

  try {
    const dir = path.dirname(filePath);

    // Create parent directories if needed
    if (createDirs && !fs.existsSync(dir)) {
      createDirectory(dir);
    }

    // Check if file exists
    if (fs.existsSync(filePath) && !overwrite) {
      Logger.warn(`File already exists (skipped): ${filePath}`);
      return false;
    }

    // Write file
    fs.writeFileSync(filePath, content, { encoding });
    Logger.info(`Created file: ${filePath}`);
    return true;
  } catch (error) {
    Logger.error(`Failed to write file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Write multiple files
 */
export function writeFiles(
  files: Array<{ path: string; content: string }>,
  baseDir: string,
  options?: FileCreationOptions
): number {
  let count = 0;

  for (const file of files) {
    const fullPath = path.join(baseDir, file.path);
    if (writeFile(fullPath, file.content, options)) {
      count++;
    }
  }

  return count;
}

/**
 * Read file content
 */
export function readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): string {
  try {
    return fs.readFileSync(filePath, { encoding });
  } catch (error) {
    Logger.error(`Failed to read file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Check if directory exists
 */
export function directoryExists(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

/**
 * Delete file
 */
export function deleteFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      Logger.info(`Deleted file: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    Logger.error(`Failed to delete file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Delete directory recursively
 */
export function deleteDirectory(dirPath: string): boolean {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      Logger.info(`Deleted directory: ${dirPath}`);
      return true;
    }
    return false;
  } catch (error) {
    Logger.error(`Failed to delete directory ${dirPath}:`, error);
    throw error;
  }
}

/**
 * List files in directory
 */
export function listFiles(dirPath: string, recursive = false): string[] {
  try {
    if (!fs.existsSync(dirPath)) return [];

    const files: string[] = [];

    const traverse = (dir: string): void => {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isFile()) {
          files.push(fullPath);
        } else if (stat.isDirectory() && recursive) {
          traverse(fullPath);
        }
      }
    };

    traverse(dirPath);
    return files;
  } catch (error) {
    Logger.error(`Failed to list files in ${dirPath}:`, error);
    return [];
  }
}

/**
 * Copy file
 */
export function copyFile(
  source: string,
  destination: string,
  options: FileCreationOptions = {}
): boolean {
  try {
    const { createDirs = true } = options;

    if (!fs.existsSync(source)) {
      throw new Error(`Source file not found: ${source}`);
    }

    const dir = path.dirname(destination);
    if (createDirs && !fs.existsSync(dir)) {
      createDirectory(dir);
    }

    fs.copyFileSync(source, destination);
    Logger.info(`Copied file: ${source} → ${destination}`);
    return true;
  } catch (error) {
    Logger.error(`Failed to copy file ${source}:`, error);
    throw error;
  }
}

/**
 * Get directory size in bytes
 */
export function getDirectorySize(dirPath: string): number {
  let size = 0;

  try {
    if (!fs.existsSync(dirPath)) return 0;

    const traverse = (dir: string): void => {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isFile()) {
          size += stat.size;
        } else if (stat.isDirectory()) {
          traverse(fullPath);
        }
      }
    };

    traverse(dirPath);
  } catch (error) {
    Logger.error(`Failed to calculate directory size for ${dirPath}:`, error);
  }

  return size;
}

/**
 * FileGenerator namespace for backward compatibility
 */
export const FileGenerator = {
  createDirectory,
  createDirectories,
  writeFile,
  writeFiles,
  readFile,
  fileExists,
  directoryExists,
  deleteFile,
  deleteDirectory,
  listFiles,
  copyFile,
  getDirectorySize,
};
