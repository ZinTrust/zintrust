import {
  Helpers,
  isAlpha,
  isAlphanumeric,
  isArray,
  isBase64,
  isBetween,
  isBoolean,
  isBooleanString,
  isDate,
  isDecimal,
  isDefined,
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
  isMissingLike,
  isNegative,
  isNonEmptyArray,
  isNonEmptyObject,
  isNonEmptyString,
  isNotIn,
  isNull,
  isNullish,
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
    expect(isArray('not-array')).toBe(false);

    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);

    expect(isFunction(() => {})).toBe(true);
    expect(isFunction({})).toBe(false);

    expect(isDate(new Date())).toBe(true);
    expect(isDate(new Date('invalid'))).toBe(false);
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
    expect(isNull(' null ')).toBe(true);
    expect(isNull('')).toBe(true);
    expect(isNull(undefined)).toBe(false);
    expect(isNull('undefined')).toBe(false);
    expect(isNull('   ')).toBe(false);

    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefined(null)).toBe(false);

    expect(isUndefinedOrNull(undefined)).toBe(true);
    expect(isUndefinedOrNull(null)).toBe(true);
    expect(isUndefinedOrNull('')).toBe(true); // '' treated as null by isNull
    expect(isUndefinedOrNull('NULL')).toBe(true);
    expect(isUndefinedOrNull('undefined')).toBe(false);

    expect(isMissingLike(undefined)).toBe(true);
    expect(isMissingLike(null)).toBe(true);
    expect(isMissingLike('')).toBe(true);
    expect(isMissingLike('NULL')).toBe(true);
    expect(isMissingLike('undefined')).toBe(false);

    expect(isNullish(undefined)).toBe(true);
    expect(isNullish(null)).toBe(true);
    expect(isNullish('')).toBe(false);

    expect(isDefined('value')).toBe(true);
    expect(isDefined(0)).toBe(true);
    expect(isDefined(null)).toBe(false);
    expect(isDefined(undefined)).toBe(false);
  });

  it('boolean helpers', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean('true', true)).toBe(true);
    expect(isBoolean(' false ', true)).toBe(true);
    expect(isBoolean('1', true)).toBe(true);
    expect(isBoolean('0', true)).toBe(true);
    expect(isBoolean(1, true)).toBe(false);
    expect(isBoolean(0, true)).toBe(false);
    expect(isBoolean('yes', true)).toBe(false);

    expect(isBooleanString('true')).toBe(true);
    expect(isBooleanString('FALSE')).toBe(true);
    expect(isBooleanString(' 0 ')).toBe(true);
    expect(isBooleanString(true)).toBe(false);
    expect(isBooleanString('yes')).toBe(false);
  });

  it('email and url', () => {
    expect(isEmail('me@example.com')).toBe(true);
    expect(isEmail('me@localhost')).toBe(false);
    expect(isEmail('me@example')).toBe(false);

    expect(isUrl('http://example.com')).toBe(true);
    expect(isUrl('https://x.y')).toBe(true);
    expect(isUrl('ftp://example.com')).toBe(false);
    expect(isUrl('not a url')).toBe(false);
    expect(isUrl(42)).toBe(false);
  });

  it('in / notIn and string matchers', () => {
    expect(isIn('a', ['a', 'b'])).toBe(true);
    expect(isIn('c', ['a', 'b'])).toBe(false);

    expect(isNotIn('c', ['a', 'b'])).toBe(true);
    expect(isNotIn('a', ['a', 'b'])).toBe(false);

    expect(isMatch('abc123', /\d+$/)).toBe(true);
    expect(isMatch('abc123', /(abc)/g)).toBe(true);
    expect(isMatch(12, /\d+/)).toBe(false);
    expect(isMatch('abc', {} as RegExp)).toBe(false);

    const long = '9'.repeat(5000);
    expect(isMatch(long, /^9+$/)).toBe(false);
    expect(isMatch(long, /^9+$/, { maxLength: 6000 })).toBe(true);

    expect(isAlpha('abc')).toBe(true);
    expect(isAlpha('abc1')).toBe(false);

    expect(isAlphanumeric('a1b2')).toBe(true);
    expect(isAlphanumeric('a-1')).toBe(false);
  });

  it('length helpers', () => {
    expect(isLength('abc', 3)).toBe(true);
    expect(isLength([1, 2], 2)).toBe(true);
    expect(isLength('abc', 2)).toBe(false);

    expect(isMinLength('abcd', 3)).toBe(true);
    expect(isMinLength([1, 2], 3)).toBe(false);

    expect(isMaxLength('ab', 3)).toBe(true);
    expect(isMaxLength([1, 2, 3, 4], 3)).toBe(false);
    expect(isMaxLength(10, 3)).toBe(false);
  });

  it('numeric / integer / float checks', () => {
    expect(isNumeric(123)).toBe(true);
    expect(isNumeric('123.45')).toBe(true);
    expect(isNumeric('+123')).toBe(true);
    expect(isNumeric('-123.45')).toBe(true);
    expect(isNumeric('  ')).toBe(false);
    expect(isNumeric(Number.POSITIVE_INFINITY)).toBe(false);

    expect(isInt(1)).toBe(true);
    expect(isInt(1.0)).toBe(true);
    expect(isInt(1.5)).toBe(false);
    expect(isInt('2', true)).toBe(true);
    expect(isInt(' 2 ', true)).toBe(true);
    expect(isInt('-3', true, { min: -5, max: 0 })).toBe(true);
    expect(isInt('10', true, { max: 5 })).toBe(false);
    expect(isInt(true, true)).toBe(false);

    expect(isFloat(1.5)).toBe(true);
    expect(isFloat(1)).toBe(true);
    expect(isFloat('1.5', true)).toBe(true);
    expect(isFloat('-1.5', true, { min: -2, max: -1 })).toBe(true);
    expect(isFloat('1.5.1', true)).toBe(false);
    expect(isFloatString('2.5')).toBe(true);
    expect(isFloatString('abc')).toBe(false);
    expect(isIntString('2')).toBe(true);
    expect(isIntString('2.5')).toBe(false);
  });

  it('non-empty collections/strings', () => {
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString(' ')).toBe(false);

    expect(isNonEmptyArray([1])).toBe(true);
    expect(isNonEmptyArray([])).toBe(false);

    expect(isNonEmptyObject({ a: 1 })).toBe(true);
    expect(isNonEmptyObject({})).toBe(false);
    expect(isNonEmptyObject([])).toBe(false);
  });

  it('format validators', () => {
    expect(isWhitespaceOnly('   ')).toBe(true);
    expect(isWhitespaceOnly('a')).toBe(false);
    expect(isWhitespaceOnly('')).toBe(false);

    expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUUID('not-a-uuid')).toBe(false);

    expect(isJSON('{"a":1}')).toBe(true);
    expect(isJSON('invalid')).toBe(false);
    expect(isJSON('[]')).toBe(true);

    expect(isBase64('aGVsbG8=')).toBe(true);
    expect(isBase64('YWJjZA==')).toBe(true);
    expect(isBase64('')).toBe(false);
    expect(isBase64('abc')).toBe(false);
    expect(isBase64('a===')).toBe(false);
    expect(isBase64('not@@base64')).toBe(false);

    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#ffffff')).toBe(true);
    expect(isHexColor('#ffff')).toBe(true);
    expect(isHexColor('#ffffffff')).toBe(true);
    expect(isHexColor('#12')).toBe(false);
    expect(isHexColor('not a color')).toBe(false);

    expect(isSlug('my-blog-post')).toBe(true);
    expect(isSlug('slug-2')).toBe(true);
    expect(isSlug('My-Blog-Post')).toBe(false);
    expect(isSlug('my--blog')).toBe(false);

    expect(isUpperCase('ABC')).toBe(true);
    expect(isUpperCase('ABC!')).toBe(true);
    expect(isUpperCase('123')).toBe(false);
    expect(isUpperCase('AbC')).toBe(false);

    expect(isLowerCase('abc')).toBe(true);
    expect(isLowerCase('abc!')).toBe(true);
    expect(isLowerCase('123')).toBe(false);
    expect(isLowerCase('aBc')).toBe(false);
  });

  it('numeric predicates', () => {
    expect(isPositive(5)).toBe(true);
    expect(isPositive(-5)).toBe(false);
    expect(isPositive(0)).toBe(false);

    expect(isNegative(-5)).toBe(true);
    expect(isNegative(5)).toBe(false);
    expect(isNegative(0)).toBe(false);

    expect(isZero(0)).toBe(true);
    expect(isZero(1)).toBe(false);

    expect(isEven(4)).toBe(true);
    expect(isEven(5)).toBe(false);
    expect(isEven(4.2)).toBe(false);

    expect(isOdd(5)).toBe(true);
    expect(isOdd(4)).toBe(false);
    expect(isOdd(3.5)).toBe(false);

    expect(isDecimal(1.5)).toBe(true);
    expect(isDecimal(1)).toBe(false);
    expect(isDecimal(Number.POSITIVE_INFINITY)).toBe(false);

    expect(isBetween(5, 0, 10)).toBe(true);
    expect(isBetween(15, 0, 10)).toBe(false);
    expect(isBetween('5', 0, 10)).toBe(false);

    expect(isDivisibleBy(10, 5)).toBe(true);
    expect(isDivisibleBy(10, 3)).toBe(false);
    expect(isDivisibleBy(10, 0)).toBe(false);
    expect(isDivisibleBy(10.5, 5)).toBe(false);
  });

  it('exports the helper factory consistently', () => {
    expect(Object.isFrozen(Helpers)).toBe(true);
    expect(Helpers.isBoolean).toBe(isBoolean);
    expect(Helpers.isMissingLike).toBe(isMissingLike);
    expect(Helpers.isNullish).toBe(isNullish);
    expect(Helpers.isBase64).toBe(isBase64);
    expect(Helpers.isUpperCase).toBe(isUpperCase);
    expect(Helpers.isLowerCase).toBe(isLowerCase);
    expect(Object.keys(Helpers)).toHaveLength(48);
  });
});
