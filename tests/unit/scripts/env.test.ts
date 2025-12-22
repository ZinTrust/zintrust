import { loadEnv, parseEnvLine, stripQuotes } from '@scripts/utils/env';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');

describe('Environment Utils', () => {
  describe('stripQuotes', () => {
    it('should return the value as is if length is less than 2', () => {
      expect(stripQuotes('a')).toBe('a');
      expect(stripQuotes('')).toBe('');
    });

    it('should strip double quotes', () => {
      expect(stripQuotes('"value"')).toBe('value');
    });

    it('should strip single quotes', () => {
      expect(stripQuotes("'value'")).toBe('value');
    });

    it('should not strip mismatched quotes', () => {
      expect(stripQuotes('"value\'')).toBe('"value\'');
      expect(stripQuotes('\'value"')).toBe('\'value"');
    });

    it('should not strip quotes if not at start and end', () => {
      expect(stripQuotes('value')).toBe('value');
      expect(stripQuotes('"value')).toBe('"value');
      expect(stripQuotes('value"')).toBe('value"');
    });
  });

  describe('parseEnvLine', () => {
    it('should return null for empty lines', () => {
      expect(parseEnvLine('')).toBeNull();
      expect(parseEnvLine('   ')).toBeNull();
    });

    it('should return null for comments', () => {
      expect(parseEnvLine('# comment')).toBeNull();
      expect(parseEnvLine('  # comment')).toBeNull();
    });

    it('should return null if no equals sign', () => {
      expect(parseEnvLine('KEY')).toBeNull();
    });

    it('should return null if key is empty', () => {
      expect(parseEnvLine('=value')).toBeNull();
    });

    it('should parse valid lines', () => {
      expect(parseEnvLine('KEY=value')).toEqual({ key: 'KEY', value: 'value' });
    });

    it('should parse lines with spaces around equals', () => {
      // The current implementation splits by first '=', then trims.
      // 'KEY = value' -> key: 'KEY', value: 'value'
      expect(parseEnvLine('KEY = value')).toEqual({ key: 'KEY', value: 'value' });
    });

    it('should parse lines with quotes', () => {
      expect(parseEnvLine('KEY="value"')).toEqual({ key: 'KEY', value: 'value' });
      expect(parseEnvLine("KEY='value'")).toEqual({ key: 'KEY', value: 'value' });
    });

    it('should preserve inner quotes', () => {
      expect(parseEnvLine('KEY="va\'lue"')).toEqual({ key: 'KEY', value: "va'lue" });
    });
  });

  describe('loadEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.clearAllMocks();
    });

    it('should do nothing if .env file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      loadEnv();
      // No changes to env
    });

    it('should load variables from .env file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('TEST_KEY=test_value\nANOTHER_KEY=123');

      loadEnv();

      expect(process.env['TEST_KEY']).toBe('test_value');
      expect(process.env['ANOTHER_KEY']).toBe('123');
    });

    it('should skip invalid or comment lines while loading', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# comment\n\nINVALID_LINE\nOK=1');

      loadEnv();

      expect(process.env['OK']).toBe('1');
    });

    it('should not override existing variables by default', () => {
      process.env['EXISTING_KEY'] = 'original';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('EXISTING_KEY=new_value');

      loadEnv();

      expect(process.env['EXISTING_KEY']).toBe('original');
    });

    it('should override existing variables if override is true', () => {
      process.env['EXISTING_KEY'] = 'original';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('EXISTING_KEY=new_value');

      loadEnv(true);

      expect(process.env['EXISTING_KEY']).toBe('new_value');
    });

    it('should handle errors gracefully', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Access denied');
      });

      expect(() => loadEnv()).not.toThrow();
    });
  });
});
