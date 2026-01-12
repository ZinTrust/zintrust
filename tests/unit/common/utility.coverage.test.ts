import {
  generateSecureJobId,
  isEmpty,
  isNumericString,
  sanitize,
  stripSpaces,
  toMinusDecimal,
  toPlusDecimal,
  toStr,
} from '@/common/utility';
import { describe, expect, it } from 'vitest';

describe('utility helpers (coverage)', () => {
  it('implements legacy isEmpty semantics', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty(false)).toBe(true);
    expect(isEmpty(0)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('0')).toBe(true);

    expect(isEmpty('00')).toBe(false);
    expect(isEmpty(1)).toBe(false);
  });

  it('string utilities behave as expected', () => {
    expect(toStr(undefined)).toBe('');
    expect(stripSpaces(' a b  c ')).toBe('abc');
    expect(sanitize('a-b.c@', /[^A-Za-z0-9\-.]/g, true)).toBe('a-b.c');
    expect(isNumericString(' 12.34 ')).toBe(true);
    expect(isNumericString('')).toBe(false);
    expect(isNumericString('abc')).toBe(false);
  });

  it('decimal helpers clamp/parse as designed', () => {
    expect(toPlusDecimal('1.23456789', 4)).toBe(1.2345);
    expect(toPlusDecimal('-1.23', 8)).toBe(0);
    expect(toPlusDecimal('1e-7', 8)).toBe(0.0000001);

    expect(toMinusDecimal('-1.234567', 2)).toBe(-1.23);
    expect(toMinusDecimal('1.9999', 2)).toBe(1.99);
    expect(toMinusDecimal('1e-7', 8)).toBe(0.0000001);
  });

  it('can generate a secure job id (smoke)', () => {
    const id = generateSecureJobId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
