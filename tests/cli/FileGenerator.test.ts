import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { default as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDir = path.join(__dirname, 'test-scaffold');

describe('FileGenerator Directory Creation Basic', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create a directory', () => {
    const dir = path.join(testDir, 'mydir');
    const result = FileGenerator.createDirectory(dir);

    expect(result).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('should create nested directories', () => {
    const dir = path.join(testDir, 'a', 'b', 'c');
    const result = FileGenerator.createDirectory(dir);

    expect(result).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('should return false if directory already exists', () => {
    const dir = path.join(testDir, 'mydir');
    FileGenerator.createDirectory(dir);
    const result = FileGenerator.createDirectory(dir);

    expect(result).toBe(false);
  });
});

describe('FileGenerator Directory Creation Multiple', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create multiple directories', () => {
    const dirs = ['src', 'app/Models', 'routes', 'tests'];
    FileGenerator.createDirectories(dirs, testDir);

    for (const dir of dirs) {
      const fullPath = path.join(testDir, dir);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('should handle nested directories', () => {
    const dirs = ['app/Models/User', 'app/Controllers/UserController'];
    FileGenerator.createDirectories(dirs, testDir);

    for (const dir of dirs) {
      const fullPath = path.join(testDir, dir);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('should handle empty directory list', () => {
    expect(() => FileGenerator.createDirectories([], testDir)).not.toThrow();
  });
});

describe('FileGenerator Directory Checks and Deletion', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should return true for existing directories', () => {
    FileGenerator.createDirectory(testDir);
    expect(FileGenerator.directoryExists(testDir)).toBe(true);
  });

  it('should return false for non-existing directories', () => {
    expect(FileGenerator.directoryExists(path.join(testDir, 'nonexistent'))).toBe(false);
  });

  it('should return false for files', () => {
    const filePath = path.join(testDir, 'test.txt');
    FileGenerator.writeFile(filePath, 'content');

    expect(FileGenerator.directoryExists(filePath)).toBe(false);
  });

  it('should delete a directory recursively', () => {
    FileGenerator.createDirectory(testDir);
    const result = FileGenerator.deleteDirectory(testDir);

    expect(result).toBe(true);
    expect(fs.existsSync(testDir)).toBe(false);
  });

  it('should delete directory with files', () => {
    FileGenerator.writeFile(path.join(testDir, 'file.txt'), 'content');
    const result = FileGenerator.deleteDirectory(testDir);

    expect(result).toBe(true);
    expect(fs.existsSync(testDir)).toBe(false);
  });
});

describe('FileGenerator File Writing Basic', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should write a file', () => {
    const filePath = path.join(testDir, 'test.txt');
    const content = 'Hello, World!';
    const result = FileGenerator.writeFile(filePath, content, { createDirs: true });

    expect(result).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('should create parent directories by default', () => {
    const filePath = path.join(testDir, 'nested', 'path', 'file.txt');
    FileGenerator.writeFile(filePath, 'content', { createDirs: true });

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('should skip existing files without overwrite', () => {
    const filePath = path.join(testDir, 'test.txt');
    FileGenerator.writeFile(filePath, 'original');
    const result = FileGenerator.writeFile(filePath, 'updated', { overwrite: false });

    expect(result).toBe(false);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');
  });

  it('should overwrite files with overwrite option', () => {
    const filePath = path.join(testDir, 'test.txt');
    FileGenerator.writeFile(filePath, 'original');
    FileGenerator.writeFile(filePath, 'updated', { overwrite: true });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('updated');
  });

  it('should write with specific encoding', () => {
    const filePath = path.join(testDir, 'test.txt');
    FileGenerator.writeFile(filePath, 'Hello', { encoding: 'utf-8' });

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello');
  });
});

describe('FileGenerator File Writing Multiple', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should write multiple files', () => {
    const files = [
      { path: 'file1.txt', content: 'Content 1' },
      { path: 'file2.txt', content: 'Content 2' },
      { path: 'file3.txt', content: 'Content 3' },
    ];

    const count = FileGenerator.writeFiles(files, testDir);

    expect(count).toBe(3);
    for (const file of files) {
      const fullPath = path.join(testDir, file.path);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.readFileSync(fullPath, 'utf-8')).toBe(file.content);
    }
  });

  it('should create nested files', () => {
    const files = [{ path: 'src/app/index.ts', content: 'export {}' }];
    FileGenerator.writeFiles(files, testDir);

    expect(fs.existsSync(path.join(testDir, 'src/app/index.ts'))).toBe(true);
  });

  it('should return count of created files', () => {
    const files = [
      { path: 'file1.txt', content: 'Content' },
      { path: 'file2.txt', content: 'Content' },
    ];

    const count = FileGenerator.writeFiles(files, testDir);
    expect(count).toBe(2);
  });
});

describe('FileGenerator File Reading and Deletion', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should return true for existing files', () => {
    const filePath = path.join(testDir, 'test.txt');
    FileGenerator.writeFile(filePath, 'content');

    expect(FileGenerator.fileExists(filePath)).toBe(true);
  });

  it('should return false for non-existing files', () => {
    const filePath = path.join(testDir, 'nonexistent.txt');
    expect(FileGenerator.fileExists(filePath)).toBe(false);
  });

  it('should return false for directories', () => {
    FileGenerator.createDirectory(testDir);
    expect(FileGenerator.fileExists(testDir)).toBe(false);
  });

  it('should read file content', () => {
    const filePath = path.join(testDir, 'test.txt');
    const content = 'Hello, World!';
    FileGenerator.writeFile(filePath, content);

    expect(FileGenerator.readFile(filePath)).toBe(content);
  });

  it('should throw for non-existing files', () => {
    const filePath = path.join(testDir, 'nonexistent.txt');
    expect(() => FileGenerator.readFile(filePath)).toThrow();
  });
});

describe('FileGenerator File Deletion and Listing', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should delete a file', () => {
    const filePath = path.join(testDir, 'test.txt');
    FileGenerator.writeFile(filePath, 'content');
    const result = FileGenerator.deleteFile(filePath);

    expect(result).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should return false if file does not exist', () => {
    const filePath = path.join(testDir, 'nonexistent.txt');
    const result = FileGenerator.deleteFile(filePath);

    expect(result).toBe(false);
  });

  it('should list files in directory', () => {
    FileGenerator.writeFile(path.join(testDir, 'file1.txt'), 'content');
    FileGenerator.writeFile(path.join(testDir, 'file2.txt'), 'content');

    const files = FileGenerator.listFiles(testDir);
    expect(files.length).toBe(2);
  });

  it('should not list directories', () => {
    FileGenerator.createDirectory(path.join(testDir, 'subdir'));
    FileGenerator.writeFile(path.join(testDir, 'file.txt'), 'content');

    const files = FileGenerator.listFiles(testDir);
    expect(files.length).toBe(1);
  });

  it('should list files recursively', () => {
    FileGenerator.writeFile(path.join(testDir, 'file1.txt'), 'content');
    FileGenerator.writeFile(path.join(testDir, 'subdir', 'file2.txt'), 'content');

    const files = FileGenerator.listFiles(testDir, true);
    expect(files.length).toBe(2);
  });
});

describe('FileGenerator Copy Operations', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should copy a file', () => {
    const source = path.join(testDir, 'source.txt');
    const dest = path.join(testDir, 'dest.txt');
    const content = 'Hello';

    FileGenerator.writeFile(source, content);
    FileGenerator.copyFile(source, dest);

    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf-8')).toBe(content);
  });

  it('should create parent directories when copying', () => {
    const source = path.join(testDir, 'source.txt');
    const dest = path.join(testDir, 'nested', 'path', 'dest.txt');

    FileGenerator.writeFile(source, 'content');
    FileGenerator.copyFile(source, dest, { createDirs: true });

    expect(fs.existsSync(dest)).toBe(true);
  });

  it('should throw for non-existing source', () => {
    const source = path.join(testDir, 'nonexistent.txt');
    const dest = path.join(testDir, 'dest.txt');

    expect(() => FileGenerator.copyFile(source, dest)).toThrow();
  });
});

describe('FileGenerator Size Operations', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should calculate directory size', () => {
    FileGenerator.writeFile(path.join(testDir, 'file.txt'), 'Hello'); // 5 bytes
    const size = FileGenerator.getDirectorySize(testDir);

    expect(size).toBe(5);
  });

  it('should calculate size recursively', () => {
    FileGenerator.writeFile(path.join(testDir, 'file1.txt'), 'Hi'); // 2 bytes
    FileGenerator.writeFile(path.join(testDir, 'sub', 'file2.txt'), 'World'); // 5 bytes

    const size = FileGenerator.getDirectorySize(testDir);
    expect(size).toBe(7);
  });

  it('should return 0 for non-existing directory', () => {
    const size = FileGenerator.getDirectorySize(path.join(testDir, 'nonexistent'));
    expect(size).toBe(0);
  });
});
