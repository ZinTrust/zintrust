/**
 * File Generator
 * Handles creation of files and directories
 * Sealed namespace with file I/O operations
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
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
const createDirectory = (dirPath: string): boolean => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      Logger.info(`Created directory: ${dirPath}`);
      return true;
    }
    return false;
  } catch (error) {
    throw ErrorFactory.createCliError(`Failed to create directory ${dirPath}:`, error);
  }
};

/**
 * Create multiple directories
 */
const createDirectories = (directories: string[], baseDir: string): void => {
  for (const dir of directories) {
    const fullPath = path.join(baseDir, dir);
    createDirectory(fullPath);
  }
};

/**
 * Write file content
 */
const writeFile = (
  filePath: string,
  content: string,
  options: FileCreationOptions = {}
): boolean => {
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
    throw ErrorFactory.createCliError(`Failed to write file ${filePath}:`, error);
  }
};

/**
 * Write multiple files
 */
const writeFiles = (
  files: Array<{ path: string; content: string }>,
  baseDir: string,
  options?: FileCreationOptions
): number => {
  let count = 0;

  for (const file of files) {
    const fullPath = path.join(baseDir, file.path);
    if (writeFile(fullPath, file.content, options)) {
      count++;
    }
  }

  return count;
};

/**
 * Read file content
 */
const readFile = (filePath: string, encoding: BufferEncoding = 'utf-8'): string => {
  try {
    return fs.readFileSync(filePath, { encoding });
  } catch (error) {
    throw ErrorFactory.createCliError(`Failed to read file ${filePath}:`, error);
  }
};

/**
 * Check if file exists
 */
const fileExists = (filePath: string): boolean => {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
};

/**
 * Check if directory exists
 */
const directoryExists = (dirPath: string): boolean => {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
};

/**
 * Delete file
 */
const deleteFile = (filePath: string): boolean => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      Logger.info(`Deleted file: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    throw ErrorFactory.createCliError(`Failed to delete file ${filePath}:`, error);
  }
};

/**
 * Delete directory recursively
 */
const deleteDirectory = (dirPath: string): boolean => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      Logger.info(`Deleted directory: ${dirPath}`);
      return true;
    }
    return false;
  } catch (error) {
    throw ErrorFactory.createCliError(`Failed to delete directory ${dirPath}:`, error);
  }
};

/**
 * List files in directory
 */
const listFiles = (dirPath: string, recursive = false): string[] => {
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
    ErrorFactory.createCliError(`Failed to list files in ${dirPath}:`, error);
    return [];
  }
};

/**
 * Copy file
 */
const copyFile = (
  source: string,
  destination: string,
  options: FileCreationOptions = {}
): boolean => {
  try {
    const { createDirs = true } = options;

    if (!fs.existsSync(source)) {
      ErrorFactory.createCliError(`Source file not found: ${source}`, { source });
    }

    const dir = path.dirname(destination);
    if (createDirs && !fs.existsSync(dir)) {
      createDirectory(dir);
    }

    fs.copyFileSync(source, destination);
    Logger.info(`Copied file: ${source} → ${destination}`);
    return true;
  } catch (error) {
    throw ErrorFactory.createCliError(`Failed to copy file ${source}:`, error);
  }
};

/**
 * Get directory size in bytes
 */
const getDirectorySize = (dirPath: string): number => {
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
    throw ErrorFactory.createCliError(`Failed to calculate directory size for ${dirPath}:`, error);
  }

  return size;
};

/**
 * FileGenerator namespace - sealed for immutability
 */
export const FileGenerator = Object.freeze({
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
});
