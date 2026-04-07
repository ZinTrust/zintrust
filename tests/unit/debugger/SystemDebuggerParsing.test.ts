import { describe, expect, it } from 'vitest';

import { redactString } from '../../../packages/trace/src/utils/redact';
import { parseStackFrameLine } from '../../../packages/trace/src/utils/stackFrame';

describe('System trace parsing helpers', () => {
  it('redacts selected query parameters without regex backtracking', () => {
    expect(redactString('token=abc123&keep=visible&password=s3cret', ['token', 'password'])).toBe(
      'token=[REDACTED]&keep=visible&password=[REDACTED]'
    );
  });

  it('keeps malformed or partial query segments intact', () => {
    expect(redactString('plain&=noop&user=name&&token=abc', ['token'])).toBe(
      'plain&=noop&user=name&&token=[REDACTED]'
    );
  });

  it('parses wrapped and direct stack frames deterministically', () => {
    expect(parseStackFrameLine('    at handler (/srv/app/file.ts:42:9)')).toEqual({
      file: '/srv/app/file.ts',
      line: 42,
    });
    expect(parseStackFrameLine('    at /srv/app/worker.ts:18:4')).toEqual({
      file: '/srv/app/worker.ts',
      line: 18,
    });
  });

  it('returns null for unsupported stack lines', () => {
    expect(parseStackFrameLine('Error: boom')).toBeNull();
    expect(parseStackFrameLine('    at handler (native)')).toBeNull();
  });
});
