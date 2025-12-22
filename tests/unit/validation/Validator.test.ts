import { ValidationError as ValidationErrorClass } from '@/validation/ValidationError';
import { Schema, ValidationError, Validator } from '@/validation/Validator';
import { describe, expect, it } from 'vitest';

describe('Validator', () => {
  it('should validate required fields', () => {
    const schema = new Schema().required('name');

    expect(() => Validator.validate({}, schema)).toThrow(ValidationError);
    expect(Validator.validate({ name: 'John' }, schema)).toEqual({ name: 'John' });
  });

  it('should validate types', () => {
    const schema = new Schema()
      .string('name')
      .number('age')
      .boolean('active')
      .array('tags')
      .integer('count');

    const validData = {
      name: 'John',
      age: 30,
      active: true,
      tags: ['a', 'b'],
      count: 10,
    };

    expect(Validator.validate(validData, schema)).toEqual(validData);

    expect(() => Validator.validate({ name: 123 }, schema)).toThrow(ValidationError);
    expect(() => Validator.validate({ age: '30' }, schema)).toThrow(ValidationError);
    expect(() => Validator.validate({ active: 1 }, schema)).toThrow(ValidationError);
    expect(() => Validator.validate({ tags: 'a' }, schema)).toThrow(ValidationError);
    expect(() => Validator.validate({ count: 10.5 }, schema)).toThrow(ValidationError);
  });

  it('should validate email', () => {
    const schema = new Schema().email('email');

    expect(Validator.validate({ email: 'test@example.com' }, schema)).toEqual({
      email: 'test@example.com',
    });
    expect(() => Validator.validate({ email: 'invalid' }, schema)).toThrow(ValidationError);
  });

  it('should validate min/max', () => {
    const schema = new Schema().min('age', 18).max('age', 100);

    expect(Validator.validate({ age: 20 }, schema)).toEqual({ age: 20 });
    expect(() => Validator.validate({ age: 17 }, schema)).toThrow(ValidationError);
    expect(() => Validator.validate({ age: 101 }, schema)).toThrow(ValidationError);
  });

  it('should validate minLength/maxLength', () => {
    const schema = new Schema().minLength('name', 3).maxLength('name', 10);

    expect(Validator.validate({ name: 'John' }, schema)).toEqual({ name: 'John' });
    expect(() => Validator.validate({ name: 'Jo' }, schema)).toThrow(ValidationError);
    expect(() => Validator.validate({ name: 'VeryLongNameHere' }, schema)).toThrow(ValidationError);
  });

  it('should validate minLength/maxLength for arrays', () => {
    const schema = new Schema().minLength('tags', 2).maxLength('tags', 3);

    expect(Validator.validate({ tags: ['a', 'b'] }, schema)).toEqual({ tags: ['a', 'b'] });
    expect(() => Validator.validate({ tags: ['a'] }, schema)).toThrow(ValidationError);
    expect(() => Validator.validate({ tags: ['a', 'b', 'c', 'd'] }, schema)).toThrow(
      ValidationError
    );
  });

  it('should validate regex', () => {
    const schema = new Schema().regex('code', /^[A-Z]{3}$/);

    expect(Validator.validate({ code: 'ABC' }, schema)).toEqual({ code: 'ABC' });
    expect(() => Validator.validate({ code: 'abc' }, schema)).toThrow(ValidationError);
  });

  it('should validate in', () => {
    const schema = new Schema().in('role', ['admin', 'user']);

    expect(Validator.validate({ role: 'admin' }, schema)).toEqual({ role: 'admin' });
    expect(() => Validator.validate({ role: 'guest' }, schema)).toThrow(ValidationError);
  });

  it('should validate custom rule', () => {
    const schema = new Schema().custom('even', (v) => typeof v === 'number' && v % 2 === 0);

    expect(Validator.validate({ even: 2 }, schema)).toEqual({ even: 2 });
    expect(() => Validator.validate({ even: 3 }, schema)).toThrow(ValidationError);
  });

  it('should check validity without throwing', () => {
    const schema = new Schema().required('name');

    expect(Validator.isValid({ name: 'John' }, schema)).toBe(true);
    expect(Validator.isValid({}, schema)).toBe(false);
  });

  it('should return multiple errors', () => {
    const schema = new Schema().required('name').required('email');

    try {
      Validator.validate({}, schema);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (error instanceof ValidationError) {
        expect(error.errors).toHaveLength(2);
        expect(error.errors[0].field).toBe('name');
        expect(error.errors[1].field).toBe('email');
      }
    }
  });

  it('ValidationError helpers should work as expected', () => {
    const error = new ValidationErrorClass(
      [
        { field: 'email', message: 'Invalid email', rule: 'email' },
        { field: 'email', message: 'Required', rule: 'required' },
        { field: 'name', message: 'Required', rule: 'required' },
      ],
      'Custom message'
    );

    expect(error.message).toBe('Custom message');
    expect(error.name).toBe('ValidationError');

    expect(error.toObject()).toEqual({
      email: ['Invalid email', 'Required'],
      name: ['Required'],
    });

    expect(error.getFieldError('email')).toBe('Invalid email');
    expect(error.getFieldError('missing')).toBeUndefined();

    expect(error.hasFieldError('email')).toBe(true);
    expect(error.hasFieldError('missing')).toBe(false);
  });
});
