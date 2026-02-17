import {
  isAlpha,
  isAlphanumeric,
  isArray,
  isBase64,
  isBetween,
  isBoolean,
  isBooleanString,
  isDate,
  isDecimal,
  isDivisibleBy,
  isEmail,
  isEmpty,
  isEven,
  isFloat,
  isFloatString,
  isFunction,
  isHexColor,
  isIn,
  isInt,
  isIntString,
  isJSON,
  isLength,
  isLowerCase,
  isMatch,
  isMaxLength,
  isMinLength,
  isNegative,
  isNonEmptyArray,
  isNonEmptyObject,
  isNonEmptyString,
  isNotIn,
  isNull,
  isNumeric,
  isObject,
  isOdd,
  isPositive,
  isSlug,
  isString,
  isUndefined,
  isUndefinedOrNull,
  isUpperCase,
  isUrl,
  isUUID,
  isWhitespaceOnly,
  isZero,
} from '@helper/index';

describe('helper validators', () => {
  it('basic type checks', () => {
    expect(isString('a')).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isArray([1, 2])).toBe(true);
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isFunction(() => {})).toBe(true);
    expect(isDate(new Date())).toBe(true);
  });

  it('empty / null / undefined semantics', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty(false)).toBe(true);
    expect(isEmpty(0)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('0')).toBe(true);

    expect(isNull(null)).toBe(true);
    expect(isNull('null')).toBe(true);
    expect(isNull('NULL')).toBe(true);
    expect(isNull('')).toBe(true);

    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefinedOrNull(undefined)).toBe(true);
    expect(isUndefinedOrNull(null)).toBe(true);
    expect(isUndefinedOrNull('')).toBe(true); // '' treated as null by isNull
  });

  it('boolean helpers', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean('true', true)).toBe(true);
    expect(isBoolean('1', true)).toBe(true);
    expect(isBoolean('0', true)).toBe(true);

    expect(isBooleanString('true')).toBe(true);
    expect(isBooleanString('FALSE')).toBe(true);
    expect(isBooleanString(true)).toBe(false);
  });

  it('email and url', () => {
    expect(isEmail('me@example.com')).toBe(true);
    expect(isEmail('me@localhost')).toBe(false);
    expect(isUrl('http://example.com')).toBe(true);
    expect(isUrl('https://x.y')).toBe(true);
    expect(isUrl('ftp://example.com')).toBe(false);
    expect(isUrl('not a url')).toBe(false);
  });

  it('in / notIn and string matchers', () => {
    expect(isIn('a', ['a', 'b'])).toBe(true);
    expect(isNotIn('c', ['a', 'b'])).toBe(true);
    expect(isMatch('abc123', /\d+$/)).toBe(true);

    const long = '9'.repeat(5000);
    expect(isMatch(long, /^9+$/)).toBe(false);
    expect(isMatch(long, /^9+$/, { maxLength: 6000 })).toBe(true);

    expect(isAlpha('abc')).toBe(true);
    expect(isAlphanumeric('a1b2')).toBe(true);
  });

  it('length helpers', () => {
    expect(isLength('abc', 3)).toBe(true);
    expect(isMinLength('abcd', 3)).toBe(true);
    expect(isMaxLength('ab', 3)).toBe(true);
  });

  it('numeric / integer / float checks', () => {
    expect(isNumeric(123)).toBe(true);
    expect(isNumeric('123.45')).toBe(true);
    expect(isNumeric('  ')).toBe(false);

    expect(isInt(1)).toBe(true);
    expect(isInt(1.0)).toBe(true);
    expect(isInt(1.5)).toBe(false);
    expect(isInt('2', true)).toBe(true);
    expect(isInt('-3', true, { min: -5, max: 0 })).toBe(true);
    expect(isInt('10', true, { max: 5 })).toBe(false);

    expect(isFloat(1.5)).toBe(true);
    expect(isFloat(1)).toBe(true);
    expect(isFloat('1.5', true)).toBe(true);
    expect(isFloatString('2.5')).toBe(true);
    expect(isIntString('2')).toBe(true);
  });

  it('non-empty collections/strings', () => {
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString(' ')).toBe(false);
    expect(isNonEmptyArray([1])).toBe(true);
    expect(isNonEmptyObject({ a: 1 })).toBe(true);
  });

  it('format validators', () => {
    expect(isWhitespaceOnly('   ')).toBe(true);
    expect(isWhitespaceOnly('a')).toBe(false);
    expect(isWhitespaceOnly('')).toBe(false);

    expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUUID('not-a-uuid')).toBe(false);

    expect(isJSON('{"a":1}')).toBe(true);
    expect(isJSON('invalid')).toBe(false);

    expect(isBase64('aGVsbG8=')).toBe(true);
    expect(isBase64('not@@base64')).toBe(false);

    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#ffffff')).toBe(true);
    expect(isHexColor('#ffff')).toBe(true);
    expect(isHexColor('not a color')).toBe(false);

    expect(isSlug('my-blog-post')).toBe(true);
    expect(isSlug('My-Blog-Post')).toBe(false);

    expect(isUpperCase('ABC')).toBe(true);
    expect(isLowerCase('abc')).toBe(true);
  });

  it('numeric predicates', () => {
    expect(isPositive(5)).toBe(true);
    expect(isPositive(-5)).toBe(false);

    expect(isNegative(-5)).toBe(true);
    expect(isNegative(5)).toBe(false);

    expect(isZero(0)).toBe(true);
    expect(isZero(1)).toBe(false);

    expect(isEven(4)).toBe(true);
    expect(isEven(5)).toBe(false);

    expect(isOdd(5)).toBe(true);
    expect(isOdd(4)).toBe(false);

    expect(isDecimal(1.5)).toBe(true);
    expect(isDecimal(1)).toBe(false);

    expect(isBetween(5, 0, 10)).toBe(true);
    expect(isBetween(15, 0, 10)).toBe(false);

    expect(isDivisibleBy(10, 5)).toBe(true);
    expect(isDivisibleBy(10, 3)).toBe(false);
  });
});
