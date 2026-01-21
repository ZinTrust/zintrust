import { describe, expect, it } from 'vitest';

import { getFloat } from '@config/env';

describe('env getFloat', () => {
  it('returns default when env value is missing', () => {
    delete process.env.MISSING_FLOAT;
    expect(getFloat('MISSING_FLOAT', 1.25)).toBe(1.25);
  });

  it('returns default when env value is empty', () => {
    process.env.EMPTY_FLOAT = '   ';
    expect(getFloat('EMPTY_FLOAT', 2.5)).toBe(2.5);
  });

  it('parses float values', () => {
    process.env.FLOAT_VALUE = '3.14';
    expect(getFloat('FLOAT_VALUE')).toBe(3.14);
  });
});
