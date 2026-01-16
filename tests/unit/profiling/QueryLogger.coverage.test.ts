import { QueryLogger } from '@profiling/QueryLogger';
import { beforeEach, describe, expect, it } from 'vitest';

const resetLogger = (): void => {
  QueryLogger.clear();
};

describe('QueryLogger coverage', () => {
  beforeEach(() => {
    resetLogger();
  });

  it('caps contexts and deletes oldest', () => {
    for (let i = 0; i < 1005; i++) {
      QueryLogger.setContext(`ctx-${i}`);
      QueryLogger.logQuery('SELECT 1', [], 1);
    }

    const allLogs = QueryLogger.getAllLogs();
    expect(allLogs.size).toBeLessThanOrEqual(1000);
  });

  it('caps queries per context', () => {
    QueryLogger.setContext('cap');
    for (let i = 0; i < 510; i++) {
      QueryLogger.logQuery('SELECT 1', [], 1);
    }

    const log = QueryLogger.getQueryLog('cap');
    expect(log.length).toBe(500);
  });

  it('detects N+1 suspects using threshold', () => {
    QueryLogger.setContext('suspect');
    for (let i = 0; i < 6; i++) {
      QueryLogger.logQuery('SELECT * FROM users WHERE id = ?', [i], 1);
    }

    const suspects = QueryLogger.getN1Suspects('suspect', 5);
    expect(suspects.length).toBe(1);
  });

  it('clears specific contexts and resets current', () => {
    QueryLogger.setContext('a');
    QueryLogger.logQuery('SELECT 1', [], 1);

    QueryLogger.setContext('b');
    QueryLogger.logQuery('SELECT 1', [], 1);

    QueryLogger.clear('a');
    expect(QueryLogger.getQueryLog('a').length).toBe(0);

    QueryLogger.clear();
    expect(QueryLogger.getContext()).toBe('default');
  });
});
