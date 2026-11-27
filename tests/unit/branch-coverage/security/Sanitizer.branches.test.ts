import { Sanitizer } from '@security/Sanitizer';
import { describe, expect, it } from 'vitest';

/**
 * Branch-focused coverage for Sanitizer's bulletproof guards and the empty-input
 * short circuits of the specialized whitelist helpers.
 */
describe('branch coverage: Sanitizer branches', () => {
  it('keeps the legacy parseAmount fallback for values beyond the numeric limit', () => {
    // The 64-character bulletproof cap keeps Number(cleaned) finite, so the
    // post-sanitization "non-finite" guard is only reachable in legacy mode.
    expect(Sanitizer.parseAmount('9'.repeat(400), false)).toBe(0);
    expect(() => Sanitizer.parseAmount('9'.repeat(30))).toThrow(
      /Number exceeds safe integer range/
    );
  });

  it('keeps every whitelist helper on its empty-input branch', () => {
    expect(Sanitizer.alphanumericDotDash('')).toBe('');
    expect(Sanitizer.numericDotOnly('')).toBe('');
    expect(Sanitizer.addressText('')).toBe('');
    expect(Sanitizer.emailLike('')).toBe('');
    expect(Sanitizer.messageText('')).toBe('');
    expect(Sanitizer.nameText('')).toBe('');
    expect(Sanitizer.wordCharsAndSpaces('')).toBe('');
    expect(Sanitizer.safePasswordChars('')).toBe('');
    expect(Sanitizer.ipAddressText('')).toBe('');
    expect(Sanitizer.alphaNumericColonDash('')).toBe('');
    expect(Sanitizer.dateSlash('')).toBe('');
    expect(Sanitizer.lowercaseAlphanumeric('')).toBe('');
    expect(Sanitizer.uppercaseAlphanumeric('')).toBe('');
    expect(Sanitizer.alphanumericNoSpaces('')).toBe('');
    expect(Sanitizer.dateSlashNoSpaces('')).toBe('');
    expect(Sanitizer.uuidTokenSafe('')).toBe('');
    expect(Sanitizer.tokenSafe('')).toBe('');
    expect(Sanitizer.keyLike('')).toBe('');
  });

  it('rejects plus prefixes, scientific notation, and malformed shapes for non-negative strings', () => {
    expect(() => Sanitizer.nonNegativeNumericStringOrNull('+5')).toThrow(/Plus sign not allowed/);
    expect(() => Sanitizer.nonNegativeNumericStringOrNull('1e5')).toThrow(
      /Scientific notation not allowed/
    );
    expect(() => Sanitizer.nonNegativeNumericStringOrNull('.5')).toThrow(/Invalid numeric format/);
    expect(() => Sanitizer.nonNegativeNumericStringOrNull('9007199254740992.1')).toThrow(
      /Number exceeds safe integer range/
    );
  });

  it('rejects signed, scientific, and overflowing decimal strings', () => {
    expect(() => Sanitizer.decimalString('1e5')).toThrow(/Scientific notation not allowed/);
    expect(() => Sanitizer.decimalString('-1')).toThrow(/Signed values not allowed/);
    expect(() => Sanitizer.decimalString('9'.repeat(64))).toThrow(
      /Decimal value exceeds safe range/
    );
    expect(Sanitizer.decimalString('')).toBe('');
  });
});
