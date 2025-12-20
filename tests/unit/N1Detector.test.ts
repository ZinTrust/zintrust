import { N1Detector } from '@profiling/N1Detector';
import { QueryLogEntry } from '@profiling/types';
import { beforeEach, describe, expect, it } from 'vitest';

describe('N1Detector', () => {
  let detector: N1Detector;

  beforeEach(() => {
    detector = new N1Detector();
  });

  it('should detect N+1 pattern with 5+ identical queries', () => {
    const logs: QueryLogEntry[] = [
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [1],
        duration: 10,
        timestamp: new Date(),
        context: 'req-1',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [2],
        duration: 10,
        timestamp: new Date(),
        context: 'req-1',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [3],
        duration: 10,
        timestamp: new Date(),
        context: 'req-1',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [4],
        duration: 10,
        timestamp: new Date(),
        context: 'req-1',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [5],
        duration: 10,
        timestamp: new Date(),
        context: 'req-1',
      },
    ];

    const patterns = detector.detect(logs);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].queryCount).toBe(5);
    expect(patterns[0].table).toBe('users');
  });

  it('should mark critical N+1 pattern with 10+ queries', () => {
    const logs: QueryLogEntry[] = Array.from({ length: 10 }, (_, i) => ({
      sql: 'SELECT * FROM posts WHERE user_id = ?',
      params: [i + 1],
      duration: 8,
      timestamp: new Date(),
      context: 'req-2',
    }));

    const patterns = detector.detect(logs);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].severity).toBe('critical');
  });

  it('should mark warning N+1 pattern with 5-9 queries', () => {
    const logs: QueryLogEntry[] = Array.from({ length: 7 }, (_, i) => ({
      sql: 'SELECT * FROM comments WHERE post_id = ?',
      params: [i + 1],
      duration: 5,
      timestamp: new Date(),
      context: 'req-3',
    }));

    const patterns = detector.detect(logs);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].severity).toBe('warning');
  });

  it('should not flag queries < 5 occurrences', () => {
    const logs: QueryLogEntry[] = [
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [1],
        duration: 10,
        timestamp: new Date(),
        context: 'req-4',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [2],
        duration: 10,
        timestamp: new Date(),
        context: 'req-4',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [3],
        duration: 10,
        timestamp: new Date(),
        context: 'req-4',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [4],
        duration: 10,
        timestamp: new Date(),
        context: 'req-4',
      },
    ];

    const patterns = detector.detect(logs);
    expect(patterns).toHaveLength(0);
  });

  it('should extract table name from SELECT query', () => {
    const logs: QueryLogEntry[] = Array.from({ length: 5 }, (_, i) => ({
      sql: 'SELECT * FROM products WHERE id = ?',
      params: [i + 1],
      duration: 12,
      timestamp: new Date(),
      context: 'req-5',
    }));

    const patterns = detector.detect(logs);
    expect(patterns[0].table).toBe('products');
  });

  it('should handle multiple N+1 patterns in same request', () => {
    const logs: QueryLogEntry[] = [
      // Pattern 1: 5 queries on users table
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [1],
        duration: 10,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [2],
        duration: 10,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [3],
        duration: 10,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [4],
        duration: 10,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [5],
        duration: 10,
        timestamp: new Date(),
        context: 'req-6',
      },
      // Pattern 2: 6 queries on posts table
      {
        sql: 'SELECT * FROM posts WHERE user_id = ?',
        params: [1],
        duration: 8,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM posts WHERE user_id = ?',
        params: [2],
        duration: 8,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM posts WHERE user_id = ?',
        params: [3],
        duration: 8,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM posts WHERE user_id = ?',
        params: [4],
        duration: 8,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM posts WHERE user_id = ?',
        params: [5],
        duration: 8,
        timestamp: new Date(),
        context: 'req-6',
      },
      {
        sql: 'SELECT * FROM posts WHERE user_id = ?',
        params: [6],
        duration: 8,
        timestamp: new Date(),
        context: 'req-6',
      },
    ];

    const patterns = detector.detect(logs);
    expect(patterns).toHaveLength(2);
    expect(patterns.map((p) => p.table).sort((a, b) => a.localeCompare(b))).toEqual([
      'posts',
      'users',
    ]);
  });

  it('should ignore different SQL queries', () => {
    const logs: QueryLogEntry[] = [
      {
        sql: 'SELECT * FROM users WHERE id = ?',
        params: [1],
        duration: 10,
        timestamp: new Date(),
        context: 'req-7',
      },
      {
        sql: 'SELECT COUNT(*) FROM users',
        params: [],
        duration: 5,
        timestamp: new Date(),
        context: 'req-7',
      },
      {
        sql: 'SELECT * FROM posts WHERE id = ?',
        params: [1],
        duration: 8,
        timestamp: new Date(),
        context: 'req-7',
      },
    ];

    const patterns = detector.detect(logs);
    expect(patterns).toHaveLength(0);
  });

  it('should return empty array for empty logs', () => {
    const patterns = detector.detect([]);
    expect(patterns).toHaveLength(0);
  });
});
