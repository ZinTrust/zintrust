import { BaseAdapter } from '@/orm/DatabaseAdapter';
import { describe, expect, it } from 'vitest';

describe('BaseAdapter utilities', () => {
  it('buildParameterizedQuery uses default placeholder when none provided', () => {
    const sql = 'SELECT * FROM users WHERE a = ? AND b = ?';
    const result = BaseAdapter.buildParameterizedQuery(sql, [1, 2]);

    // Default placeholder returns '?', so sql remains unchanged but still processed
    expect(result.sql).toBe(sql);
    expect(result.parameters).toEqual([1, 2]);
  });

  it('buildParameterizedQuery supports custom placeholders', () => {
    const sql = 'SELECT * FROM users WHERE a = ? AND b = ?';
    const result = BaseAdapter.buildParameterizedQuery(sql, [1, 2], (i) => `$${i}`);
    expect(result.sql).toBe('SELECT * FROM users WHERE a = $1 AND b = $2');
    expect(result.parameters).toEqual([1, 2]);
  });
});
