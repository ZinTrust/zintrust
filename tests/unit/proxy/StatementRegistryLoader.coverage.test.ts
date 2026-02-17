import { beforeEach, describe, expect, it, vi } from 'vitest';

const envGetMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock('@config/env', () => ({
  Env: {
    get: (...args: unknown[]) => envGetMock(...args),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  default: {
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  },
}));

import { loadStatementRegistry } from '../../../../src/proxy/StatementRegistryLoader';

describe('StatementRegistryLoader (coverage extras)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envGetMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it('loads from statements file when ZT_*_STATEMENTS_FILE is set', () => {
    envGetMock.mockImplementation((key: string) => {
      if (key === 'ZT_POSTGRES_STATEMENTS_FILE') return '/tmp/registry.json';
      return '';
    });
    readFileSyncMock.mockReturnValueOnce(JSON.stringify({ a: 'SELECT 1', b: 123 }));

    const out = loadStatementRegistry('POSTGRES');
    expect(out).toEqual({ a: 'SELECT 1' });
  });

  it('returns undefined when file read/parse fails', () => {
    envGetMock.mockImplementation((key: string) => {
      if (key === 'ZT_MYSQL_STATEMENTS_FILE') return '/tmp/registry.json';
      return '';
    });
    readFileSyncMock.mockReturnValueOnce('{bad-json');

    expect(loadStatementRegistry('MYSQL')).toBeUndefined();
  });

  it('loads from statements JSON when ZT_*_STATEMENTS_JSON is set', () => {
    envGetMock.mockImplementation((key: string) => {
      if (key === 'ZT_SQLSERVER_STATEMENTS_FILE') return '';
      if (key === 'ZT_SQLSERVER_STATEMENTS_JSON') return JSON.stringify({ a: 'SELECT 1' });
      return '';
    });

    expect(loadStatementRegistry('SQLSERVER')).toEqual({ a: 'SELECT 1' });
  });

  it('returns undefined when statements JSON is invalid', () => {
    envGetMock.mockImplementation((key: string) => {
      if (key === 'ZT_POSTGRES_STATEMENTS_FILE') return '';
      if (key === 'ZT_POSTGRES_STATEMENTS_JSON') return '{nope';
      return '';
    });

    expect(loadStatementRegistry('POSTGRES')).toBeUndefined();
  });
});
