/* eslint-disable max-nested-callbacks */
import { BaseAdapter } from '@/orm/DatabaseAdapter';
import { describe, expect, it } from 'vitest';

interface DatabaseConfig {
  driver: 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver';
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

describe('DatabaseAdapter - Interfaces and BaseAdapter', () => {
  describe('BaseAdapter Utilities', () => {
    it('should sanitize values correctly', () => {
      expect(BaseAdapter.sanitize(null)).toBe('NULL');
      expect(BaseAdapter.sanitize(undefined)).toBe('NULL');
      expect(BaseAdapter.sanitize('hello')).toBe("'hello'");
      expect(BaseAdapter.sanitize("it's me")).toBe("'it''s me'");
      expect(BaseAdapter.sanitize(true)).toBe('1');
      expect(BaseAdapter.sanitize(false)).toBe('0');
      expect(BaseAdapter.sanitize(123)).toBe('123');
      expect(BaseAdapter.sanitize({ a: 1 })).toBe('\'{"a":1}\'');
    });

    it('should build parameterized queries', () => {
      const sql = 'SELECT * FROM users WHERE id = ? AND name = ?';
      const params = [1, 'John'];
      const result = BaseAdapter.buildParameterizedQuery(sql, params, (i) => `$${i}`);

      expect(result.sql).toBe('SELECT * FROM users WHERE id = $1 AND name = $2');
      expect(result.parameters).toEqual([1, 'John']);
    });
  });

  describe('DatabaseConfig Interface', () => {
    it('should accept valid config', () => {
      const config: DatabaseConfig = {
        driver: 'sqlite',
        database: ':memory:',
      };
      expect(config.driver).toBe('sqlite');
    });
  });
});
