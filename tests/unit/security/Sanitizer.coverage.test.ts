import { Sanitizer, createSanitizer } from '@security/Sanitizer';
import { describe, expect, it } from 'vitest';

describe('Sanitizer (coverage)', () => {
  it('creates a frozen sanitizer object', () => {
    const s = createSanitizer();
    expect(Object.isFrozen(s)).toBe(true);
  });

  it('sanitizes common inputs as expected', () => {
    expect(Sanitizer.parseAmount('$ 1,234.50')).toBe(1234.5);
    expect(Sanitizer.parseAmount('nope', false)).toBe(0);

    expect(Sanitizer.alphanumeric('A B-1_')).toBe('AB1');
    expect(Sanitizer.alphanumericDotDash('a-b.c@')).toBe('a-b.c');

    expect(Sanitizer.lockNonNegativeNumberString('12.34')).toBe('12.34');
    expect(Sanitizer.lockNonNegativeNumberString(' -12 ')).toBe(0);
    expect(Sanitizer.lockNonNegativeNumberString('abc')).toBeNull();

    expect(Sanitizer.addressText('Main St #5')).toBe('Main St 5');
    expect(Sanitizer.emailLike('hi there @+_-.')).toBe('hithere@+_-.');
    expect(Sanitizer.email('t e+s.t@x_y.com')).toBe('tes.t@x_y.com');
    expect(Sanitizer.messageText('hello<>$')).toBe('hello$');
    expect(Sanitizer.nameText('John-Doe. Jr.')).toBe('JohnDoe. Jr.');
    expect(Sanitizer.wordCharsAndSpaces('Hello-World_ 123')).toBe('HelloWorld_ 123');
    expect(Sanitizer.safePasswordChars('a€b!@#', false)).toBe('ab!@#');

    expect(Sanitizer.numericDotOnly(' -1.2 ')).toBe('1.2');
    expect(Sanitizer.ipAddressText('::1<script>')).toBe('::1script');
    expect(Sanitizer.alphaNumericColonDash('abc:12-34.')).toBe('abc:12-34');
    expect(Sanitizer.digitsOnly(' 1 2-3 ')).toBe('123');
    expect(Sanitizer.decimalString('12.3.4')).toBe('12.34');
    expect(Sanitizer.dateSlash('12/34-56')).toBe('12/3456');
    expect(Sanitizer.lowercaseAlphanumeric('AbC-1')).toBe('abc1');
    expect(Sanitizer.uppercaseAlphanumeric('AbC-1')).toBe('ABC1');
    expect(Sanitizer.alphanumericNoSpaces('A B!')).toBe('AB');
    expect(Sanitizer.dateSlashNoSpaces(' 12/34 ')).toBe('12/34');
    expect(Sanitizer.uuidTokenSafe('550e8400-e29b=bad!')).toBe('550e8400-e29b=bad');
    expect(Sanitizer.tokenSafe('tok_en-==bad!')).toBe('tok_en-==bad');
    expect(Sanitizer.keyLike('key:part-1.2 !')).toBe('key:part-1.2');
  });

  it('preserves legacy empty semantics', () => {
    expect(Sanitizer.parseAmount(0)).toBe(0);
    expect(Sanitizer.alphanumeric('0')).toBe('');
    expect(Sanitizer.lockNonNegativeNumberString('0')).toBe(0);
  });
});
