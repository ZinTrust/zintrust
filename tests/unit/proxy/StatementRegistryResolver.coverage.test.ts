import { describe, expect, it } from 'vitest';

import { resolveStatementOrError } from '../../../src/proxy/StatementRegistryResolver';

describe('StatementRegistryResolver (coverage extras)', () => {
  it('returns config error when registry is missing', () => {
    const out = resolveStatementOrError(undefined, { statementId: 's1', params: [] });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      expect(out.response.body.code).toBe('CONFIG_ERROR');
    }
  });

  it('returns validation error when statement payload is invalid', () => {
    const out = resolveStatementOrError({ s1: 'select 1' }, { statementId: 123 } as any);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      expect(out.response.body.code).toBe('VALIDATION_ERROR');
    }
  });
});
