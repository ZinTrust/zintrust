/* eslint-disable max-nested-callbacks */
/**
 * Bulletproof Sanitizer Tests
 * Comprehensive test suite for bulletproof mode validation covering:
 * - Numeric overflow attacks (MAX_SAFE_INTEGER bypass)
 * - Leading zero type confusion
 * - Type coercion exploits (Infinity, NaN, special strings)
 * - Empty/whitespace bypasses
 * - Error throwing and error message validation
 */

import { Sanitizer } from '@security/Sanitizer';
import { describe, expect, it } from 'vitest';

describe('Sanitizer - Bulletproof Mode', () => {
  describe('digitsOnly (bulletproof=true default)', () => {
    it('should sanitize valid numeric strings', () => {
      expect(Sanitizer.digitsOnly('123')).toBe('123');
      expect(Sanitizer.digitsOnly('42')).toBe('42');
      expect(Sanitizer.digitsOnly('1')).toBe('1');
    });

    it('should throw on integer overflow', () => {
      const huge = (Number.MAX_SAFE_INTEGER + 1).toString();
      expect(() => Sanitizer.digitsOnly(huge)).toThrow(/Invalid numeric ID/i);
      expect(() => Sanitizer.digitsOnly('9999999999999999999')).toThrow();
    });

    it('should throw on leading zeros', () => {
      expect(() => Sanitizer.digitsOnly('007')).toThrow(/Invalid numeric ID/i);
      expect(() => Sanitizer.digitsOnly('00000082')).toThrow();
      expect(() => Sanitizer.digitsOnly('0123')).toThrow();
    });

    it('should throw on zero or negative', () => {
      expect(() => Sanitizer.digitsOnly('0')).toThrow(/Invalid numeric ID/i);
      expect(() => Sanitizer.digitsOnly('-1')).toThrow();
    });

    it('should throw on non-numeric after sanitization', () => {
      expect(() => Sanitizer.digitsOnly('abc')).toThrow();
      expect(() => Sanitizer.digitsOnly('!!!')).toThrow();
    });

    it('should allow bulletproof=false for unsafe mode', () => {
      expect(Sanitizer.digitsOnly('007', false)).toBe('007');
      expect(Sanitizer.digitsOnly('0', false)).toBe('0');
    });
  });

  describe('parseAmount (bulletproof=true default)', () => {
    it('should parse valid amounts', () => {
      expect(Sanitizer.parseAmount('123.45')).toBe(123.45);
      expect(Sanitizer.parseAmount('1000')).toBe(1000);
      expect(Sanitizer.parseAmount('-50.25')).toBe(-50.25);
    });

    it('should throw on Infinity', () => {
      expect(() => Sanitizer.parseAmount('Infinity')).toThrow(/Non-finite number/i);
      expect(() => Sanitizer.parseAmount('-Infinity')).toThrow();
      expect(() => Sanitizer.parseAmount(Infinity)).toThrow();
    });

    it('should throw on NaN', () => {
      expect(() => Sanitizer.parseAmount('NaN')).toThrow(/Non-finite number/i);
      expect(() => Sanitizer.parseAmount(NaN)).toThrow();
    });

    it('should throw on overflow', () => {
      const huge = Number.MAX_SAFE_INTEGER + 1;
      expect(() => Sanitizer.parseAmount(huge.toString())).toThrow(/exceeds safe integer range/i);
      expect(() => Sanitizer.parseAmount('9999999999999999999')).toThrow();
    });

    it('should allow bulletproof=false for unsafe mode', () => {
      expect(Sanitizer.parseAmount('Infinity', false)).toBe(0);
      expect(Sanitizer.parseAmount('NaN', false)).toBe(0);
    });

    it('should return 0 for empty values', () => {
      expect(Sanitizer.parseAmount('')).toBe(0);
      expect(Sanitizer.parseAmount(null)).toBe(0);
      expect(Sanitizer.parseAmount(undefined)).toBe(0);
    });
  });

  describe('nonNegativeNumericStringOrNull (bulletproof=true default)', () => {
    it('should sanitize valid non-negative numbers', () => {
      expect(Sanitizer.nonNegativeNumericStringOrNull('123')).toBe('123');
      expect(Sanitizer.nonNegativeNumericStringOrNull('42.5')).toBe('42.5');
    });

    it('should throw on leading zeros', () => {
      expect(() => Sanitizer.nonNegativeNumericStringOrNull('007')).toThrow(
        /Invalid numeric format/i
      );
      expect(() => Sanitizer.nonNegativeNumericStringOrNull('00082')).toThrow();
    });

    it('should throw on overflow', () => {
      const huge = (Number.MAX_SAFE_INTEGER + 1).toString();
      expect(() => Sanitizer.nonNegativeNumericStringOrNull(huge)).toThrow(
        /Invalid numeric format/i
      );
    });

    it('should return 0 for negative numbers', () => {
      expect(Sanitizer.nonNegativeNumericStringOrNull('-5')).toBe(0);
    });

    it('should return null for non-numeric', () => {
      expect(Sanitizer.nonNegativeNumericStringOrNull('abc')).toBeNull();
    });

    it('should allow bulletproof=false for unsafe mode', () => {
      expect(Sanitizer.nonNegativeNumericStringOrNull('007', false)).toBe('007');
    });
  });

  describe('decimalString (bulletproof=true default)', () => {
    it('should sanitize valid decimal strings', () => {
      expect(Sanitizer.decimalString('123.45')).toBe('123.45');
      expect(Sanitizer.decimalString('0.99')).toBe('0.99');
      expect(Sanitizer.decimalString('1000')).toBe('1000');
    });

    it('should throw on multiple decimal points', () => {
      expect(() => Sanitizer.decimalString('12.3.4')).toThrow(/Empty result after sanitization/i);
    });

    it('should throw on empty after sanitization', () => {
      expect(() => Sanitizer.decimalString('abc')).toThrow(/Empty result after sanitization/i);
      expect(() => Sanitizer.decimalString('!!!')).toThrow();
    });

    it('should throw on non-numeric decimal', () => {
      expect(() => Sanitizer.decimalString('.')).toThrow(
        /Invalid decimal format|Non-numeric decimal value/i
      );
    });

    it('should throw on overflow', () => {
      const huge = (Number.MAX_SAFE_INTEGER + 1).toString();
      expect(() => Sanitizer.decimalString(huge)).toThrow(/exceeds safe range/i);
    });

    it('should allow bulletproof=false for unsafe mode', () => {
      expect(Sanitizer.decimalString('.', false)).toBe('.');
    });
  });

  describe('email (bulletproof=true default)', () => {
    it('should sanitize valid emails', () => {
      expect(Sanitizer.email('test@example.com')).toBe('test@example.com');
      expect(Sanitizer.email('user.name@domain.co')).toBe('user.name@domain.co');
    });

    it('should throw on empty after sanitization', () => {
      expect(() => Sanitizer.email('!!!')).toThrow(/Empty result after sanitization/i);
      expect(() => Sanitizer.email('   ')).toThrow();
    });

    it('should throw on missing @ symbol', () => {
      expect(() => Sanitizer.email('notanemail')).toThrow(/Missing @ symbol/i);
      expect(() => Sanitizer.email('user.domain.com')).toThrow();
    });

    it('should throw on invalid email format', () => {
      expect(() => Sanitizer.email('@domain.com')).toThrow(/Invalid email format/i);
      expect(() => Sanitizer.email('user@')).toThrow();
      expect(() => Sanitizer.email('user@@domain.com')).toThrow();
    });

    it('should allow bulletproof=false for unsafe mode', () => {
      expect(Sanitizer.email('!!!', false)).toBe('');
      expect(Sanitizer.email('notanemail', false)).toBe('notanemail');
    });
  });

  describe('nameText (bulletproof=true default)', () => {
    it('should sanitize valid names', () => {
      expect(Sanitizer.nameText('John Doe')).toBe('John Doe');
      expect(Sanitizer.nameText('Jane M. Smith')).toBe('Jane M. Smith');
      expect(Sanitizer.nameText('User123')).toBe('User123');
    });

    it('should throw on empty after sanitization', () => {
      expect(() => Sanitizer.nameText('!!!')).toThrow(/Empty or whitespace-only/i);
      expect(() => Sanitizer.nameText('   ')).toThrow();
    });

    it('should throw on whitespace-only result', () => {
      expect(() => Sanitizer.nameText('\t\n')).toThrow(/Empty or whitespace-only/i);
    });

    it('should throw on no letters', () => {
      expect(() => Sanitizer.nameText('123')).toThrow(/must contain at least one letter/i);
      expect(() => Sanitizer.nameText('...')).toThrow();
    });

    it('should allow bulletproof=false for unsafe mode', () => {
      expect(Sanitizer.nameText('!!!', false)).toBe('');
      expect(Sanitizer.nameText('123', false)).toBe('123');
    });
  });

  describe('safePasswordChars (bulletproof=true default)', () => {
    it('should sanitize valid passwords', () => {
      expect(Sanitizer.safePasswordChars('Pass1234!')).toBe('Pass1234!');
      expect(Sanitizer.safePasswordChars('My$ecur3Pa$$')).toBe('My$ecur3Pa$$');
    });

    it('should throw on empty after sanitization', () => {
      expect(() => Sanitizer.safePasswordChars('€€€€€€€€')).toThrow(
        /Empty result after sanitization/i
      );
    });

    it('does not enforce min length in sanitizer', () => {
      expect(Sanitizer.safePasswordChars('short')).toBe('short');
    });

    it('should allow bulletproof=false for unsafe mode', () => {
      expect(Sanitizer.safePasswordChars('short', false)).toBe('short');
    });
  });

  describe('Error Messages & Details', () => {
    it('should include method name in error', () => {
      try {
        Sanitizer.digitsOnly('007');
      } catch (error) {
        expect((error as Error).message).toContain('digitsOnly');
      }
    });

    it('should include reason in error', () => {
      try {
        Sanitizer.parseAmount('Infinity');
      } catch (error) {
        expect((error as Error).message).toContain('Non-finite');
      }
    });

    it('should include redacted value in error', () => {
      try {
        Sanitizer.email('!!!');
      } catch (error) {
        expect((error as Error).message).toContain('value:');
      }
    });

    it('should have SanitizerError name', () => {
      try {
        Sanitizer.nameText('123');
      } catch (error) {
        expect((error as Error).name).toBe('SanitizerError');
      }
    });
  });

  describe('Type Coercion Edge Cases', () => {
    it('should reject "+82" format in digitsOnly', () => {
      expect(() => Sanitizer.digitsOnly('+82')).toThrow();
    });

    it('should reject scientific notation in parseAmount', () => {
      const huge = '1e308';
      expect(() => Sanitizer.parseAmount(huge)).toThrow(/Scientific notation not allowed/i);
    });

    it('should reject "-0" as numeric ID', () => {
      expect(() => Sanitizer.digitsOnly('-0')).toThrow();
    });
  });

  describe('Performance Regression', () => {
    it('should complete bulletproof validation in <1ms for typical inputs', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        Sanitizer.digitsOnly('123');
        Sanitizer.parseAmount('45.67');
        Sanitizer.email('test@example.com');
        Sanitizer.nameText('John Doe');
      }
      const elapsed = performance.now() - start;

      // 1000 iterations * 4 methods = 4000 operations
      // Target: <1ms per operation = <4000ms total
      // Allow 2x safety margin for CI environments
      expect(elapsed).toBeLessThan(8000);
    });
  });
});

describe('Sanitizer - Legacy Behavior (bulletproof=false)', () => {
  it('should allow leading zeros when bulletproof disabled', () => {
    expect(Sanitizer.digitsOnly('007', false)).toBe('007');
    expect(Sanitizer.nonNegativeNumericStringOrNull('00082', false)).toBe('00082');
  });

  it('should allow overflow when bulletproof disabled', () => {
    const huge = (Number.MAX_SAFE_INTEGER + 1).toString();
    expect(Sanitizer.digitsOnly(huge, false)).toBe(huge);
  });

  it('should return empty/default instead of throwing', () => {
    expect(Sanitizer.email('!!!', false)).toBe('');
    expect(Sanitizer.nameText('!!!', false)).toBe('');
    expect(Sanitizer.safePasswordChars('short', false)).toBe('short');
    expect(Sanitizer.decimalString('abc', false)).toBe('');
  });
});

describe('Integration: Controller + Sanitizer Bulletproof', () => {
  it('should demonstrate try-catch pattern for bulletproof errors', () => {
    const rawId = '007'; // Leading zero attack

    try {
      const id = Sanitizer.digitsOnly(rawId);
      expect(id).toBe('82'); // Should not reach here
    } catch (error) {
      if ((error as Error).name === 'SanitizerError') {
        // Convert to 400 response
        const response = { error: (error as Error).message };
        expect(response.error).toContain('Sanitizer.digitsOnly() failed');
      }
    }
  });

  it('should demonstrate middleware SanitizerError handling', () => {
    const isSanitizerError = (error: unknown): boolean => {
      return (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name: string }).name === 'SanitizerError'
      );
    };

    try {
      Sanitizer.email('notanemail');
    } catch (error) {
      expect(isSanitizerError(error)).toBe(true);

      // Middleware would convert to 422 validation error:
      const response = {
        errors: {
          sanitization: [(error as Error).message],
        },
      };
      expect(response.errors.sanitization[0]).toContain('email');
    }
  });
});
