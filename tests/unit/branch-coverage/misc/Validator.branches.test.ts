import { describe, expect, it, vi } from 'vitest';

import { Validator } from '@validation/Validator';

const { Schema, validate, isValid, rulesToSchema, validateRules, isValidRules } = Validator;

describe('Validator uncovered branches', () => {
  it('schema create/typed and all simple rules reject invalid values', () => {
    const schema = Schema.create()
      .required('name')
      .string('name')
      .number('age')
      .integer('age')
      .boolean('flag')
      .array('tags')
      .email('email')
      .alphanumeric('code')
      .uuid('id')
      .token('tok')
      .ipAddress('ip')
      .positiveNumber('positive')
      .digits('digits')
      .decimal('decimal')
      .url('site')
      .phone('phone')
      .date('when');

    expect(schema.getRules().size).toBe(15);
    expect(() =>
      validate(
        {
          name: 1,
          age: 1.5,
          flag: 'yes',
          tags: 'no',
          email: 'bad',
          code: 'a-b',
          id: 'nope',
          tok: 'a b',
          ip: '999.1.1.1',
          positive: -1,
          digits: '12a',
          decimal: 1,
          site: 'ftp://x',
          phone: 'abc',
          when: 'not-a-date',
        },
        schema
      )
    ).toThrow();
    expect(Schema.typed<{ a: string }>().getRules().size).toBe(0);
  });

  it('complex rules accept valid values and reject invalid ones', () => {
    const schema = Schema.create()
      .min('n', 2)
      .max('n', 5)
      .minLength('s', 2)
      .maxLength('s', 5)
      .regex('s', /^[a-z]+$/)
      .in('s', ['abc', 'xyz'])
      .custom('n', (value: any) => value === 3);

    expect(validate({ n: 3, s: 'abc' }, schema)).toEqual({ n: 3, s: 'abc' });
    expect(() => validate({ n: 1, s: 'a' }, schema)).toThrow();
    expect(() => validate({ n: 9, s: 'abcdef' }, schema)).toThrow();
    expect(() => validate({ n: 2, s: 'XYZ' }, schema)).toThrow();
  });

  it('custom messages and error paths', () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const schema = Schema.create().required('name', 'custom message');
    try {
      validate({}, schema);
      throw new Error('expected validation to fail');
    } catch (error: any) {
      expect(error.errors?.[0]?.message).toBe('custom message');
    }
    expect(isValid({}, schema)).toBe(false);
    expect(isValid({ name: 'ok' }, schema)).toBe(true);
    logger.mockRestore();
  });

  it('rulesToSchema/validateRules/isValidRules with string and array rules', () => {
    const schema = rulesToSchema({
      name: ['required', 'string'],
      age: 'required|integer|min:1|max:120',
    });
    expect(schema.getRules().size).toBe(2);
    expect(validateRules({ name: 'Ada', age: 36 }, { name: ['required'], age: 'integer' })).toEqual({
      name: 'Ada',
      age: 36,
    });
    expect(() => validateRules({ name: '', age: 'x' }, { name: 'required', age: 'integer' })).toThrow();
    expect(isValidRules({ name: 'Ada' }, { name: 'required' })).toBe(true);
    expect(isValidRules({}, { name: 'required' })).toBe(false);
  });

  it('rule string edge cases: blank tokens, regex literal, aliases and unknown rules', () => {
    const schema = rulesToSchema({ a: '   ', b: ['required', ''], c: 'email|regex:/^[a-z]+$/' });
    expect(schema.getRules().size).toBeGreaterThan(0);
    expect(() => validateRules({ b: 1, c: 'Abc' }, { c: 'regex:/^[a-z]+$/' })).toThrow();
  });
});
