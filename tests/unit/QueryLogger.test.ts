import { QueryLogger, QueryLoggerInstance } from '@profiling/QueryLogger';
import { beforeEach, describe, expect, it } from 'vitest';

describe('QueryLogger Basic Tests', () => {
  let logger: QueryLoggerInstance;

  beforeEach(() => {
    logger = QueryLogger.getInstance();
    logger.clear();
  });

  it('should log a query with parameters and duration', () => {
    logger.setContext('request-1');
    logger.logQuery('SELECT * FROM users WHERE id = ?', [1], 25);

    const logs = logger.getQueryLog('request-1');
    expect(logs).toHaveLength(1);
    expect(logs[0].sql).toBe('SELECT * FROM users WHERE id = ?');
    expect(logs[0].params).toEqual([1]);
    expect(logs[0].duration).toBe(25);
  });

  it('should track multiple queries in context', () => {
    logger.setContext('request-2');
    logger.logQuery('SELECT * FROM users', [], 15);
    logger.logQuery('SELECT * FROM posts', [], 12);
    logger.logQuery('SELECT COUNT(*) FROM comments', [], 8);

    const logs = logger.getQueryLog('request-2');
    expect(logs).toHaveLength(3);
  });

  it('should separate logs by context', () => {
    logger.setContext('request-a');
    logger.logQuery('SELECT * FROM users', [], 10);

    logger.setContext('request-b');
    logger.logQuery('SELECT * FROM posts', [], 15);

    expect(logger.getQueryLog('request-a')).toHaveLength(1);
    expect(logger.getQueryLog('request-b')).toHaveLength(1);
  });

  it('should get current context', () => {
    logger.setContext('my-context');
    expect(logger.getContext()).toBe('my-context');
  });

  it('should log to default context if none set', () => {
    logger.logQuery('SELECT * FROM users', [], 10);

    const logs = logger.getQueryLog('default');
    expect(logs).toHaveLength(1);
  });

  it('should not recreate existing context log array on repeated setContext', () => {
    logger.setContext('repeat');
    logger.logQuery('SELECT 1', [], 1);

    logger.setContext('repeat');
    logger.logQuery('SELECT 2', [], 1);

    expect(logger.getQueryLog('repeat')).toHaveLength(2);
  });
});

describe('QueryLogger Advanced Tests', () => {
  let logger: QueryLoggerInstance;

  beforeEach(() => {
    logger = QueryLogger.getInstance();
    logger.clear();
  });

  it('should provide query summary with execution counts', () => {
    logger.setContext('request-3');
    const query = 'SELECT * FROM users WHERE role = ?';

    // Execute same query 3 times
    logger.logQuery(query, ['admin'], 10);
    logger.logQuery(query, ['admin'], 12);
    logger.logQuery(query, ['admin'], 11);

    // Execute different query
    logger.logQuery('SELECT * FROM posts', [], 8);

    const summary = logger.getQuerySummary('request-3');
    expect(summary.size).toBe(2);

    const userQuery = summary.get(query);
    expect(userQuery?.executionCount).toBe(3);
  });

  it('should clear logs for a context', () => {
    logger.setContext('request-4');
    logger.logQuery('SELECT * FROM users', [], 10);

    let logs = logger.getQueryLog('request-4');
    expect(logs).toHaveLength(1);

    logger.clear('request-4');
    logs = logger.getQueryLog('request-4');
    expect(logs).toHaveLength(0);
  });

  it('should get current context', () => {
    logger.setContext('my-context');
    expect(logger.getContext()).toBe('my-context');
  });

  it('should log to default context if none set', () => {
    logger.logQuery('SELECT * FROM users', [], 10);

    const logs = logger.getQueryLog('default');
    expect(logs).toHaveLength(1);
  });

  it('should track query parameters correctly', () => {
    logger.setContext('request-5');
    const params = ['john@example.com', true, 25];
    logger.logQuery('INSERT INTO users (email, active, age) VALUES (?, ?, ?)', params, 30);

    const logs = logger.getQueryLog('request-5');
    expect(logs[0].params).toEqual(params);
  });
});

describe('QueryLogger Facade Coverage', () => {
  beforeEach(() => {
    QueryLogger.clear();
  });

  it('getInstance returns the same singleton instance', () => {
    const a = QueryLogger.getInstance();
    const b = QueryLogger.getInstance();
    expect(a).toBe(b);
  });

  it('facade methods forward correctly (context, counts, totals, logs)', () => {
    QueryLogger.setContext('ctx-1');
    expect(QueryLogger.getContext()).toBe('ctx-1');

    QueryLogger.logQuery('SELECT 1', [], 10);
    QueryLogger.logQuery('SELECT 2', [], 5);

    expect(QueryLogger.getQueryCount('ctx-1')).toBe(2);
    expect(QueryLogger.getTotalDuration('ctx-1')).toBe(15);

    const logs = QueryLogger.getQueryLog('ctx-1');
    expect(logs).toHaveLength(2);
    expect(logs[0].timestamp).toBeInstanceOf(Date);
  });

  it('getN1Suspects honors default threshold and custom threshold', () => {
    QueryLogger.setContext('ctx-n1');
    for (let i = 0; i < 5; i++) {
      QueryLogger.logQuery('SELECT * FROM users WHERE id = ?', [1], 1);
    }
    QueryLogger.logQuery('SELECT * FROM posts', [], 1);

    expect(QueryLogger.getQuerySummary('ctx-n1').size).toBe(2);

    expect(QueryLogger.getN1Suspects('ctx-n1')).toHaveLength(1);
    expect(QueryLogger.getN1Suspects('ctx-n1', 6)).toHaveLength(0);
  });

  it('getAllLogs returns a copy of the map and clear() resets default context', () => {
    QueryLogger.setContext('ctx-a');
    QueryLogger.logQuery('SELECT 1', [], 1);
    QueryLogger.setContext('ctx-b');
    QueryLogger.logQuery('SELECT 2', [], 2);

    const all = QueryLogger.getAllLogs();
    expect(all.size).toBe(2);

    all.clear();
    expect(QueryLogger.getAllLogs().size).toBe(2);

    QueryLogger.clear();
    expect(QueryLogger.getContext()).toBe('default');
  });
});

describe('QueryLogger Rare Branches', () => {
  let logger: QueryLoggerInstance;

  beforeEach(() => {
    logger = QueryLogger.getInstance();
    logger.clear();
  });

  it('covers the path where a context exists but its logs array is undefined', () => {
    const impl = logger as unknown as { logs: Map<string, unknown> };

    logger.setContext('weird');
    impl.logs.set('weird', undefined);

    logger.logQuery('SELECT * FROM weird', [], 1, 'weird');
    expect(logger.getQueryLog('weird')).toEqual([]);
  });
});
