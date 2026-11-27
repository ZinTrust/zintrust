import { describe, expect, it } from 'vitest';

import {
  isBase64,
  isBetween,
  isBoolean,
  isDecimal,
  isDefined,
  isDivisibleBy,
  isEmail,
  isEmpty,
  isEven,
  isFloat,
  isFloatString,
  isHexColor,
  isInt,
  isIntString,
  isJSON,
  isMissingLike,
  isNegative,
  isNull,
  isNullish,
  isNumeric,
  isOdd,
  isPositive,
  isSlug,
  isUUID,
  isUndefined,
  isUndefinedOrNull,
  isUrl,
  isWhitespaceOnly,
  isZero,
} from '@helper/index';

describe('helper branch edges', () => {
  it('empty and null-like checks', () => {
    for (const value of [null, undefined, false, 0, '', '0']) expect(isEmpty(value)).toBe(true);
    expect(isEmpty('1')).toBe(false);
    for (const value of [null, 'null', ' NULL ', '']) expect(isNull(value)).toBe(true);
    expect(isNull('x')).toBe(false);
    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefined(null)).toBe(false);
    expect(isUndefinedOrNull(null)).toBe(true);
    expect(isUndefinedOrNull('')).toBe(true);
    expect(isMissingLike(undefined)).toBe(true);
    expect(isNullish(null)).toBe(true);
    expect(isNullish('')).toBe(false);
    expect(isDefined(0)).toBe(true);
    expect(isDefined(undefined)).toBe(false);
  });

  it('boolean and numeric checks with strings and bounds', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean('TRUE', true)).toBe(true);
    expect(isBoolean(1, true)).toBe(false);
    expect(isBoolean('maybe', true)).toBe(false);
    expect(isNumeric(-1.5)).toBe(true);
    expect(isNumeric(Number.NaN)).toBe(false);
    expect(isNumeric('  1.2  ')).toBe(true);
    expect(isNumeric('  ')).toBe(false);
    expect(isNumeric({})).toBe(false);
    expect(isInt('12', true, { min: 10, max: 12 })).toBe(true);
    expect(isInt('9', true, { min: 10 })).toBe(false);
    expect(isInt('13', true, { max: 12 })).toBe(false);
    expect(isInt(1.2)).toBe(false);
    expect(isFloat('1.5', true, { min: 1, max: 2 })).toBe(true);
    expect(isFloat('0.5', true, { min: 1 })).toBe(false);
    expect(isFloat('1.5', false)).toBe(false);
    expect(isFloat(Number.NaN)).toBe(false);
    expect(isFloatString('1.5', { max: 1 })).toBe(false);
    expect(isIntString('x')).toBe(false);
  });

  it('string and format checks', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('ftp://example.com')).toBe(false);
    expect(isUrl(123)).toBe(false);
    expect(isJSON('{"a":1}')).toBe(true);
    expect(isJSON('{bad')).toBe(false);
    expect(isJSON(123)).toBe(false);
    expect(isBase64('')).toBe(false);
    expect(isBase64('abc')).toBe(false);
    expect(isBase64('YWJj')).toBe(true);
    expect(isBase64(1)).toBe(false);
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#12345')).toBe(false);
    expect(isSlug('my-post')).toBe(true);
    expect(isSlug('My-Post')).toBe(false);
    expect(isUUID('not-a-uuid')).toBe(false);
    expect(isWhitespaceOnly('  ')).toBe(true);
    expect(isWhitespaceOnly('')).toBe(false);
  });

  it('numeric predicates with non-finite and non-number values', () => {
    expect(isPositive(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPositive(-1)).toBe(false);
    expect(isNegative(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isNegative(1)).toBe(false);
    expect(isZero(Number.NaN)).toBe(false);
    expect(isZero(0)).toBe(true);
    expect(isEven(1)).toBe(false);
    expect(isEven(1.5)).toBe(false);
    expect(isOdd(2)).toBe(false);
    expect(isOdd(1.5)).toBe(false);
    expect(isDecimal(1.5)).toBe(true);
    expect(isDecimal(1)).toBe(false);
    expect(isBetween(Number.POSITIVE_INFINITY, 0, 10)).toBe(false);
    expect(isBetween(5, 0, 10)).toBe(true);
    expect(isDivisibleBy(6, 0)).toBe(false);
    expect(isDivisibleBy(6, 3)).toBe(true);
    expect(isDivisibleBy(1.5, 1)).toBe(false);
  });
});
