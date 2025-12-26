import { Schema, Validator } from '@validation/Validator';
import { describe, expect, it } from 'vitest';

describe('Validator Schema Building', () => {
  it('should build schema with fluent API', () => {
    const schema = Schema.create();
    schema.required('email').email('email').minLength('email', 5);

    const rules = schema.getRules();
    expect(rules.has('email')).toBe(true);
    expect(rules.get('email')).toHaveLength(3);
  });

  it('should support method chaining', () => {
    const schema = Schema.create().required('name').string('name').minLength('name', 3);

    expect(schema.getRules().has('name')).toBe(true);
  });
});

describe('Validator Required Validation', () => {
  it('should fail if required field is missing', () => {
    const schema = Schema.create().required('email');

    expect(() => Validator.validate({}, schema)).toThrow();
  });

  it('should pass if required field is present', () => {
    const schema = Schema.create().required('email');
    const data = { email: 'test@example.com' };

    expect(() => Validator.validate(data, schema)).not.toThrow();
  });

  it('should fail if required field is null', () => {
    const schema = Schema.create().required('email');

    expect(() => Validator.validate({ email: null }, schema)).toThrow();
  });
});

describe('Validator Email and Length Constraints', () => {
  it('should validate email format', () => {
    const schema = Schema.create().email('email');

    expect(() => Validator.validate({ email: 'test@example.com' }, schema)).not.toThrow();
    expect(() => Validator.validate({ email: 'invalid-email' }, schema)).toThrow();
  });

  it('should validate minLength', () => {
    const schema = Schema.create().minLength('name', 3);

    expect(() => Validator.validate({ name: 'ab' }, schema)).toThrow();
    expect(() => Validator.validate({ name: 'abc' }, schema)).not.toThrow();
  });

  it('should validate maxLength', () => {
    const schema = Schema.create().maxLength('name', 5);

    expect(() => Validator.validate({ name: 'abcdef' }, schema)).toThrow();
    expect(() => Validator.validate({ name: 'abcde' }, schema)).not.toThrow();
  });
});

describe('Validator Type Validation', () => {
  it('should validate string type', () => {
    const schema = Schema.create().string('name');

    expect(() => Validator.validate({ name: 'John' }, schema)).not.toThrow();
    expect(() => Validator.validate({ name: 123 }, schema)).toThrow();
  });

  it('should validate number type', () => {
    const schema = Schema.create().number('age');

    expect(() => Validator.validate({ age: 25 }, schema)).not.toThrow();
    expect(() => Validator.validate({ age: 'twenty-five' }, schema)).toThrow();
  });

  it('should validate integer type', () => {
    const schema = Schema.create().integer('count');

    expect(() => Validator.validate({ count: 5 }, schema)).not.toThrow();
    expect(() => Validator.validate({ count: 5.5 }, schema)).toThrow();
  });

  it('should validate boolean type', () => {
    const schema = Schema.create().boolean('active');

    expect(() => Validator.validate({ active: true }, schema)).not.toThrow();
    expect(() => Validator.validate({ active: 'yes' }, schema)).toThrow();
  });

  it('should validate array type', () => {
    const schema = Schema.create().array('tags');

    expect(() => Validator.validate({ tags: ['a', 'b'] }, schema)).not.toThrow();
    expect(() => Validator.validate({ tags: 'tags' }, schema)).toThrow();
  });
});

describe('Validator Range Validation', () => {
  it('should validate min number', () => {
    const schema = Schema.create().min('age', 18);

    expect(() => Validator.validate({ age: 17 }, schema)).toThrow();
    expect(() => Validator.validate({ age: 18 }, schema)).not.toThrow();
  });

  it('should validate max number', () => {
    const schema = Schema.create().max('age', 65);

    expect(() => Validator.validate({ age: 66 }, schema)).toThrow();
    expect(() => Validator.validate({ age: 65 }, schema)).not.toThrow();
  });
});

describe('Validator Advanced Rules', () => {
  it('should validate regex pattern', () => {
    const schema = Schema.create().regex('phone', /^\d{3}-\d{3}-\d{4}$/);

    expect(() => Validator.validate({ phone: '555-123-4567' }, schema)).not.toThrow();
    expect(() => Validator.validate({ phone: '5551234567' }, schema)).toThrow();
  });

  it('should validate value in list', () => {
    const schema = Schema.create().in('role', ['admin', 'user', 'guest']);

    expect(() => Validator.validate({ role: 'admin' }, schema)).not.toThrow();
    expect(() => Validator.validate({ role: 'superuser' }, schema)).toThrow();
  });

  it('should support custom validator', () => {
    const schema = Schema.create().custom('password', (val) => {
      return typeof val === 'string' && val.length >= 8;
    });

    expect(() => Validator.validate({ password: 'short' }, schema)).toThrow(); // NOSONAR
    expect(() => Validator.validate({ password: 'longenough' }, schema)).not.toThrow(); // NOSONAR
  });
});

describe('Validator Error Handling', () => {
  it('should throw ValidationError with field details', () => {
    const schema = Schema.create().required('email').email('email');

    try {
      Validator.validate({ email: 'invalid' }, schema);
      expect.fail('Should throw ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const err = error as any;
      expect(err.errors).toHaveLength(1);
      expect(err.errors[0].field).toBe('email');
    }
  });

  it('should provide error object mapping', () => {
    const schema = Schema.create().required('name').required('email');

    try {
      Validator.validate({}, schema);
    } catch (error) {
      const err = error as any;
      const obj = err.toObject();
      expect(obj['name']).toBeDefined();
      expect(obj['email']).toBeDefined();
    }
  });
});

describe('Validator Helpers and Multiple Rules', () => {
  it('should return boolean without throwing', () => {
    const schema = Schema.create().email('email');

    expect(Validator.isValid({ email: 'test@example.com' }, schema)).toBe(true);
    expect(Validator.isValid({ email: 'invalid' }, schema)).toBe(false);
  });

  it('should validate all rules on field', () => {
    const schema = Schema.create().required('password').string('password').minLength('password', 8);

    expect(() => Validator.validate({ password: 'short' }, schema)).toThrow(); // NOSONAR
    expect(() => Validator.validate({ password: 'longenough' }, schema)).not.toThrow(); // NOSONAR
  });
});
