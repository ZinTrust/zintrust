import { CommonUtils } from '@common/index';
import { default as fs } from '@node-singletons/fs';
import os from '@node-singletons/os';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('CommonUtils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('String Utilities', () => {
    describe('camelCase()', () => {
      it('should convert snake_case to camelCase', () => {
        expect(CommonUtils.camelCase('hello_world')).toBe('helloWorld');
      });

      it('should convert kebab-case to camelCase', () => {
        expect(CommonUtils.camelCase('hello-world')).toBe('helloWorld');
      });

      it('should convert PascalCase to camelCase', () => {
        expect(CommonUtils.camelCase('HelloWorld')).toBe('helloWorld');
      });

      it('should handle space-separated words', () => {
        expect(CommonUtils.camelCase('hello world test')).toBe('helloWorldTest');
      });

      it('should handle mixed separators', () => {
        expect(CommonUtils.camelCase('hello_world-test case')).toBe('helloWorldTestCase');
      });

      it('should preserve numbers', () => {
        expect(CommonUtils.camelCase('hello_world_123')).toBe('helloWorld123');
      });

      it('should handle single word', () => {
        expect(CommonUtils.camelCase('hello')).toBe('hello');
      });

      it('should handle empty string', () => {
        expect(CommonUtils.camelCase('')).toBe('');
      });
    });

    describe('toSnakeCase()', () => {
      it('should convert camelCase to snake_case', () => {
        expect(CommonUtils.toSnakeCase('helloWorld')).toBe('hello_world');
      });

      it('should convert PascalCase to snake_case', () => {
        expect(CommonUtils.toSnakeCase('HelloWorld')).toBe('hello_world');
      });

      it('should handle already snake_case', () => {
        expect(CommonUtils.toSnakeCase('hello_world')).toBe('hello_world');
      });

      it('should handle consecutive capitals', () => {
        expect(CommonUtils.toSnakeCase('HTTPResponse')).toBe('h_t_t_p_response');
      });

      it('should handle single word', () => {
        expect(CommonUtils.toSnakeCase('hello')).toBe('hello');
      });

      it('should preserve numbers', () => {
        expect(CommonUtils.toSnakeCase('helloWorld123')).toBe('hello_world123');
      });

      it('should handle empty string', () => {
        expect(CommonUtils.toSnakeCase('')).toBe('');
      });
    });

    describe('toPascalCase()', () => {
      it('should convert snake_case to PascalCase', () => {
        expect(CommonUtils.toPascalCase('hello_world')).toBe('HelloWorld');
      });

      it('should convert camelCase to PascalCase', () => {
        expect(CommonUtils.toPascalCase('helloWorld')).toBe('HelloWorld');
      });

      it('should convert kebab-case to PascalCase', () => {
        expect(CommonUtils.toPascalCase('hello-world')).toBe('HelloWorld');
      });

      it('should handle space-separated words', () => {
        expect(CommonUtils.toPascalCase('hello world test')).toBe('HelloWorldTest');
      });

      it('should handle mixed separators', () => {
        expect(CommonUtils.toPascalCase('hello_world-test case')).toBe('HelloWorldTestCase');
      });

      it('should handle single word', () => {
        expect(CommonUtils.toPascalCase('hello')).toBe('Hello');
      });

      it('should handle empty string', () => {
        expect(CommonUtils.toPascalCase('')).toBe('');
      });
    });
  });

  describe('File System Utilities', () => {
    describe('fileExists()', () => {
      it('should return true for existing file', () => {
        const filePath = path.join(tempDir, 'test.txt');
        fs.writeFileSync(filePath, 'test');
        expect(CommonUtils.fileExists(filePath)).toBe(true);
      });

      it('should return false for non-existing file', () => {
        const filePath = path.join(tempDir, 'nonexistent.txt');
        expect(CommonUtils.fileExists(filePath)).toBe(false);
      });

      it('should return false for invalid path', () => {
        expect(CommonUtils.fileExists('/invalid/path/that/does/not/exist')).toBe(false);
      });
    });

    describe('ensureDir()', () => {
      it('should create directory if it does not exist', () => {
        const dirPath = path.join(tempDir, 'new_dir');
        expect(fs.existsSync(dirPath)).toBe(false);
        CommonUtils.ensureDir(dirPath);
        expect(fs.existsSync(dirPath)).toBe(true);
      });

      it('should create nested directories', () => {
        const dirPath = path.join(tempDir, 'a', 'b', 'c');
        CommonUtils.ensureDir(dirPath);
        expect(fs.existsSync(dirPath)).toBe(true);
      });

      it('should not fail if directory already exists', () => {
        const dirPath = path.join(tempDir, 'existing_dir');
        fs.mkdirSync(dirPath);
        expect(() => CommonUtils.ensureDir(dirPath)).not.toThrow();
      });
    });

    describe('readFile()', () => {
      it('should read file contents', () => {
        const filePath = path.join(tempDir, 'test.txt');
        const content = 'Hello, World!';
        fs.writeFileSync(filePath, content);
        expect(CommonUtils.readFile(filePath)).toBe(content);
      });

      it('should throw error for non-existing file', () => {
        const filePath = path.join(tempDir, 'nonexistent.txt');
        expect(() => CommonUtils.readFile(filePath)).toThrow();
      });

      it('should handle UTF-8 encoded content', () => {
        const filePath = path.join(tempDir, 'utf8.txt');
        const content = 'Hello, 世界! 🌍';
        fs.writeFileSync(filePath, content, 'utf-8');
        expect(CommonUtils.readFile(filePath)).toBe(content);
      });
    });

    describe('writeFile()', () => {
      it('should write file with content', () => {
        const filePath = path.join(tempDir, 'output.txt');
        const content = 'Test content';
        CommonUtils.writeFile(filePath, content);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
      });

      it('should create parent directories by default', () => {
        const filePath = path.join(tempDir, 'new', 'nested', 'file.txt');
        CommonUtils.writeFile(filePath, 'content');
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('content');
      });

      it('should not create directories when createDir is false', () => {
        const filePath = path.join(tempDir, 'missing_dir', 'file.txt');
        expect(() => CommonUtils.writeFile(filePath, 'content', false)).toThrow();
      });

      it('should overwrite existing file', () => {
        const filePath = path.join(tempDir, 'overwrite.txt');
        CommonUtils.writeFile(filePath, 'original');
        CommonUtils.writeFile(filePath, 'updated');
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('updated');
      });
    });

    describe('deleteFile()', () => {
      it('should delete existing file', () => {
        const filePath = path.join(tempDir, 'delete.txt');
        fs.writeFileSync(filePath, 'content');
        expect(fs.existsSync(filePath)).toBe(true);
        CommonUtils.deleteFile(filePath);
        expect(fs.existsSync(filePath)).toBe(false);
      });

      it('should not throw when deleting non-existing file', () => {
        const filePath = path.join(tempDir, 'nonexistent.txt');
        expect(() => CommonUtils.deleteFile(filePath)).not.toThrow();
      });
    });
  });

  describe('Timestamp Utilities', () => {
    describe('getCurrentTimestamp()', () => {
      it('should return current timestamp in ISO format', () => {
        const timestamp = CommonUtils.getCurrentTimestamp();
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });

      it('should return valid ISO date string', () => {
        const timestamp = CommonUtils.getCurrentTimestamp();
        const date = new Date(timestamp);
        expect(date).toBeInstanceOf(Date);
        expect(date.toString()).not.toBe('Invalid Date');
      });

      it('should return recent timestamp', () => {
        const timestamp = CommonUtils.getCurrentTimestamp();
        const date = new Date(timestamp);
        const now = new Date();
        const diff = Math.abs(now.getTime() - date.getTime());
        expect(diff).toBeLessThan(1000); // Within 1 second
      });
    });

    describe('formatTimestamp()', () => {
      it('should format timestamp for filename use', () => {
        const date = new Date('2025-12-24T14:30:45.123Z');
        const formatted = CommonUtils.formatTimestamp(date);
        expect(formatted).toBe('2025-12-24T14-30-45-123Z');
      });

      it('should use current time when no argument provided', () => {
        const formatted = CommonUtils.formatTimestamp();
        expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
      });

      it('should be suitable for filenames', () => {
        const formatted = CommonUtils.formatTimestamp();
        expect(formatted).not.toContain(':');
        expect(formatted).not.toContain('.');
      });
    });

    describe('parseTimestamp()', () => {
      it('should parse ISO timestamp string', () => {
        const timestamp = '2025-12-24T14:30:45.123Z';
        const date = CommonUtils.parseTimestamp(timestamp);
        expect(date).toBeInstanceOf(Date);
        expect(date.toISOString()).toBe(timestamp);
      });

      it('should throw error for invalid timestamp', () => {
        expect(() => CommonUtils.parseTimestamp('invalid-timestamp')).toThrow();
      });

      it('should parse various date formats', () => {
        const timestamp = '2025-12-24';
        const date = CommonUtils.parseTimestamp(timestamp);
        expect(date).toBeInstanceOf(Date);
        expect(date.toString()).not.toBe('Invalid Date');
      });
    });
  });

  describe('Validation Utilities', () => {
    describe('extractErrorMessage()', () => {
      it('should extract message from Error instance', () => {
        const error = new Error('Test error');
        expect(CommonUtils.extractErrorMessage(error)).toBe('Test error');
      });

      it('should handle string errors', () => {
        expect(CommonUtils.extractErrorMessage('String error')).toBe('String error');
      });

      it('should handle object with message property', () => {
        const obj = { message: 'Object error' };
        expect(CommonUtils.extractErrorMessage(obj)).toBe('Object error');
      });

      it('should handle unknown error types', () => {
        expect(CommonUtils.extractErrorMessage(null)).toBe('Unknown error occurred');
        expect(CommonUtils.extractErrorMessage(undefined)).toBe('Unknown error occurred');
        expect(CommonUtils.extractErrorMessage(123)).toBe('Unknown error occurred');
      });

      it('should convert non-string messages to string', () => {
        const obj = { message: 123 };
        expect(CommonUtils.extractErrorMessage(obj)).toBe('123');
      });
    });

    describe('validateOptions()', () => {
      it('should not throw when all required fields are present', () => {
        const options = { name: 'test', value: 42 };
        expect(() =>
          CommonUtils.validateOptions(options, ['name', 'value'], 'TestContext')
        ).not.toThrow();
      });

      it('should throw when required field is missing', () => {
        const options = { name: 'test' };
        expect(() =>
          CommonUtils.validateOptions(options, ['name', 'value'], 'TestContext')
        ).toThrow(/Missing required options/);
      });

      it('should throw with context in error message', () => {
        const options = {};
        expect(() =>
          CommonUtils.validateOptions(options, ['field1', 'field2'], 'MyContext')
        ).toThrow(/MyContext/);
      });

      it('should list all missing fields', () => {
        const options = {};
        expect(() =>
          CommonUtils.validateOptions(options, ['field1', 'field2', 'field3'], 'Test')
        ).toThrow(/field1.*field2.*field3/);
      });

      it('should not require all fields if empty array passed', () => {
        const options = {};
        expect(() => CommonUtils.validateOptions(options, [], 'Test')).not.toThrow();
      });
    });

    describe('isValid()', () => {
      it('should return true for non-empty values', () => {
        expect(CommonUtils.isValid('string')).toBe(true);
        expect(CommonUtils.isValid(123)).toBe(true);
        expect(CommonUtils.isValid(true)).toBe(true);
        expect(CommonUtils.isValid({})).toBe(true);
        expect(CommonUtils.isValid([])).toBe(true);
      });

      it('should return false for null', () => {
        expect(CommonUtils.isValid(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(CommonUtils.isValid(undefined)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(CommonUtils.isValid('')).toBe(false);
      });

      it('should return true for zero', () => {
        expect(CommonUtils.isValid(0)).toBe(true);
      });

      it('should return true for false', () => {
        expect(CommonUtils.isValid(false)).toBe(true);
      });
    });

    describe('ensureString()', () => {
      it('should return string value', () => {
        expect(CommonUtils.ensureString('test', 'field')).toBe('test');
      });

      it('should throw for non-string values', () => {
        expect(() => CommonUtils.ensureString(123, 'field')).toThrow();
        expect(() => CommonUtils.ensureString(null, 'field')).toThrow();
        expect(() => CommonUtils.ensureString(undefined, 'field')).toThrow();
        expect(() => CommonUtils.ensureString({}, 'field')).toThrow();
      });

      it('should include field name in error message', () => {
        expect(() => CommonUtils.ensureString(123, 'myField')).toThrow(/myField/);
      });
    });

    describe('ensureObject()', () => {
      it('should return object value', () => {
        const obj = { key: 'value' };
        expect(CommonUtils.ensureObject(obj, 'field')).toBe(obj);
      });

      it('should accept arrays as objects', () => {
        const arr = [1, 2, 3];
        expect(CommonUtils.ensureObject(arr, 'field')).toBe(arr);
      });

      it('should throw for non-object values', () => {
        expect(() => CommonUtils.ensureObject('string', 'field')).toThrow();
        expect(() => CommonUtils.ensureObject(123, 'field')).toThrow();
        expect(() => CommonUtils.ensureObject(null, 'field')).toThrow();
        expect(() => CommonUtils.ensureObject(undefined, 'field')).toThrow();
      });

      it('should include field name in error message', () => {
        expect(() => CommonUtils.ensureObject('string', 'myField')).toThrow(/myField/);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should work with file operations in sequence', () => {
      const filePath = path.join(tempDir, 'integration', 'test.txt');
      const content = 'Hello, Integration Test!';

      CommonUtils.writeFile(filePath, content);
      expect(CommonUtils.fileExists(filePath)).toBe(true);
      expect(CommonUtils.readFile(filePath)).toBe(content);

      CommonUtils.deleteFile(filePath);
      expect(CommonUtils.fileExists(filePath)).toBe(false);
    });

    it('should handle case conversion roundtrip', () => {
      const snake = 'hello_world_test';
      const pascal = CommonUtils.toPascalCase(snake);
      const camel = CommonUtils.camelCase(pascal);
      expect(pascal).toBe('HelloWorldTest');
      expect(camel).toBe('helloWorldTest');
    });

    it('should validate and read configuration file', () => {
      const configPath = path.join(tempDir, 'config.json');
      const configContent = JSON.stringify({ name: 'TestApp', version: '1.0.0' });

      CommonUtils.writeFile(configPath, configContent);
      const readConfig = JSON.parse(CommonUtils.readFile(configPath));

      expect(readConfig.name).toBe('TestApp');
      expect(readConfig.version).toBe('1.0.0');
    });
  });
});
