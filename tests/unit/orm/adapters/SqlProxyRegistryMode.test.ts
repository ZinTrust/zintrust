import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  envGet: vi.fn(() => 'sql'),
  sha256Hex: vi.fn(async () => 'hash'),
}));

vi.mock('@config/env', () => ({
  Env: {
    get: (...args: any[]) => mocked.envGet(...args),
  },
}));

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    sha256Hex: (...args: any[]) => mocked.sha256Hex(...args),
  },
}));

import {
  createStatementPayload,
  getExecMetaWithLastRowId,
  resolveSqlProxyMode,
} from '@orm/adapters/SqlProxyRegistryMode';

describe('SqlProxyRegistryMode', () => {
  it('resolveSqlProxyMode returns registry only for explicit registry', () => {
    mocked.envGet.mockReturnValueOnce(' registry ');
    expect(resolveSqlProxyMode('ANY')).toBe('registry');

    mocked.envGet.mockReturnValueOnce('SQL');
    expect(resolveSqlProxyMode('ANY')).toBe('sql');

    mocked.envGet.mockReturnValueOnce('anything-else');
    expect(resolveSqlProxyMode('ANY')).toBe('sql');
  });

  it('createStatementPayload uses sha256Hex and returns params unchanged', async () => {
    const out = await createStatementPayload('select 1', [1, 'a']);
    expect(out).toEqual({ statementId: 'hash', params: [1, 'a'] });
    expect(mocked.sha256Hex).toHaveBeenCalledWith('select 1');
  });

  it('getExecMetaWithLastRowId is defensive for invalid shapes', () => {
    expect(getExecMetaWithLastRowId(null)).toEqual({ changes: 0 });
    expect(getExecMetaWithLastRowId({ ok: 'yes' })).toEqual({ changes: 0 });
    expect(getExecMetaWithLastRowId({ ok: true, meta: null })).toEqual({ changes: 0 });

    expect(getExecMetaWithLastRowId({ ok: true, meta: { changes: 3, lastRowId: 9 } })).toEqual({
      changes: 3,
      lastRowId: 9,
    });
  });
});
