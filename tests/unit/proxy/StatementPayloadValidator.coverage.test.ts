import { describe, expect, it } from 'vitest';

import { validateStatementPayload } from '../../../src/proxy/StatementPayloadValidator';

describe('StatementPayloadValidator (coverage extras)', () => {
  it('rejects non-string statementId', () => {
    const out = validateStatementPayload({ statementId: 123, params: [] } as any);
    expect(out.valid).toBe(false);
    if (!out.valid) {
      expect(out.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects empty statementId after trim', () => {
    const out = validateStatementPayload({ statementId: '   ', params: [] });
    expect(out.valid).toBe(false);
    if (!out.valid) {
      expect(out.error.message).toContain('required');
    }
  });
});
