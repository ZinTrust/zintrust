import {
  isArray,
  isBoolean,
  isDate,
  isDefined,
  isFloat,
  isFunction,
  isInt,
  isNonEmptyArray,
  isNonEmptyObject,
  isNonEmptyString,
  isNullish,
  isObject,
  isString,
} from '@helper/index';

describe('helper type safety', () => {
  it('narrows string values', () => {
    const value: unknown = 'zintrust';

    if (!isString(value)) throw new Error('expected string');

    const narrowed: string = value;
    expect(narrowed.toUpperCase()).toBe('ZINTRUST');
  });

  it('narrows arrays and objects', () => {
    const arrayValue: unknown = [1, 2, 3];
    const objectValue: unknown = { name: 'ZinTrust' };

    if (!isArray(arrayValue)) throw new Error('expected array');
    if (!isObject(objectValue)) throw new Error('expected object');

    const narrowedArray: unknown[] = arrayValue;
    const narrowedObject: Record<string, unknown> = objectValue;

    expect(narrowedArray).toHaveLength(3);
    expect(narrowedObject['name']).toBe('ZinTrust');
  });

  it('narrows functions and dates', () => {
    const fnValue: unknown = (input: string) => input.length;
    const dateValue: unknown = new Date('2026-01-01T00:00:00.000Z');

    if (!isFunction(fnValue)) throw new Error('expected function');
    if (!isDate(dateValue)) throw new Error('expected date');

    const narrowedFn: (...args: unknown[]) => unknown = fnValue;
    const narrowedDate: Date = dateValue;

    expect(narrowedFn('ok')).toBe(2);
    expect(narrowedDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('narrows strict nullish and defined values', () => {
    const maybeString: string | null | undefined = 'helper';

    if (isNullish(maybeString)) {
      const narrowedNullish: null | undefined = maybeString;
      expect(narrowedNullish === null || narrowedNullish === undefined).toBe(true);
      return;
    }

    const narrowedString: string = maybeString;
    expect(narrowedString).toBe('helper');

    const maybeNumber: number | undefined = 7;
    if (!isDefined(maybeNumber)) throw new Error('expected defined number');

    const narrowedNumber: number = maybeNumber;
    expect(narrowedNumber).toBe(7);
  });

  it('narrows boolean and numeric helper overloads', () => {
    const booleanLike: unknown = 'true';
    const intLike: unknown = '42';
    const floatLike: unknown = '3.14';

    if (!isBoolean(booleanLike, true)) throw new Error('expected boolean-like string');
    if (!isInt(intLike, true)) throw new Error('expected int-like value');
    if (!isFloat(floatLike, true)) throw new Error('expected float-like value');

    const narrowedBooleanLike: boolean | string = booleanLike;
    const narrowedIntLike: number | string = intLike;
    const narrowedFloatLike: number | string = floatLike;

    expect(narrowedBooleanLike).toBe('true');
    expect(narrowedIntLike).toBe('42');
    expect(narrowedFloatLike).toBe('3.14');
  });

  it('narrows non-empty helpers', () => {
    const maybeString: unknown = 'value';
    const maybeArray: unknown = ['item'];
    const maybeObject: unknown = { key: 'value' };

    if (!isNonEmptyString(maybeString)) throw new Error('expected non-empty string');
    if (!isNonEmptyArray(maybeArray)) throw new Error('expected non-empty array');
    if (!isNonEmptyObject(maybeObject)) throw new Error('expected non-empty object');

    const narrowedString: string = maybeString;
    const narrowedArray: unknown[] = maybeArray;
    const narrowedObject: Record<string, unknown> = maybeObject;

    expect(narrowedString).toBe('value');
    expect(narrowedArray[0]).toBe('item');
    expect(narrowedObject['key']).toBe('value');
  });
});
