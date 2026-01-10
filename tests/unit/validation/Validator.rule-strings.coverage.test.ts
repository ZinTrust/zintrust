import { Schema, Validator } from '@validation/Validator';
import { describe, expect, it } from 'vitest';

describe('Validator rule-string token handlers (coverage)', () => {
  it('supports new rule tokens via rule strings', () => {
    const schema = Validator.rulesToSchema({
      id: 'required|uuid',
      apiKey: 'required|token',
      ip: 'required|ipAddress',
      code: 'required|digits',
      price: 'required|decimal',
      website: 'required|url',
      mobile: 'required|phone',
      createdAt: 'required|date',
    });

    const valid = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      apiKey: 'abc123-DEF-456_789',
      ip: '192.168.1.1',
      code: '12345',
      price: '123.45',
      website: 'https://example.com',
      mobile: '+1-555-123-4567',
      createdAt: '2024-01-01T10:00:00Z',
    };

    expect(Validator.validate(valid, schema)).toEqual(valid);

    expect(() => Validator.validate({ ...valid, apiKey: 'bad token' }, schema)).toThrow();
    expect(() => Validator.validate({ ...valid, ip: '256.1.1.1' }, schema)).toThrow();
    expect(() => Validator.validate({ ...valid, code: '12a' }, schema)).toThrow();
    expect(() => Validator.validate({ ...valid, price: '12.3.4' }, schema)).toThrow();
    expect(() => Validator.validate({ ...valid, website: 'ftp://example.com' }, schema)).toThrow();
    expect(() => Validator.validate({ ...valid, mobile: 'not-a-phone' }, schema)).toThrow();
    expect(() => Validator.validate({ ...valid, createdAt: 'not-a-date' }, schema)).toThrow();
  });

  it('applies min/max differently for strings vs numbers', () => {
    const stringSchema = Validator.rulesToSchema({ name: 'required|string|min:3|max:5' });
    expect(Validator.validate({ name: 'John' }, stringSchema)).toEqual({ name: 'John' });
    expect(() => Validator.validate({ name: 'Jo' }, stringSchema)).toThrow();
    expect(() => Validator.validate({ name: 'TooLong' }, stringSchema)).toThrow();

    const numberSchema = Validator.rulesToSchema({ age: 'required|number|min:3|max:5' });
    expect(Validator.validate({ age: 3 }, numberSchema)).toEqual({ age: 3 });
    expect(() => Validator.validate({ age: 2 }, numberSchema)).toThrow();
    expect(() => Validator.validate({ age: 6 }, numberSchema)).toThrow();
  });

  it('supports regex and in:list parsing in rule strings', () => {
    const schema = Validator.rulesToSchema({
      code: 'required|string|regex:/^[A-Z]{3}$/',
      role: 'required|in:admin, user ,guest',
    });

    expect(Validator.validate({ code: 'ABC', role: 'admin' }, schema)).toEqual({
      code: 'ABC',
      role: 'admin',
    });

    expect(() => Validator.validate({ code: 'abc', role: 'admin' }, schema)).toThrow();
    expect(() => Validator.validate({ code: 'ABC', role: 'nope' }, schema)).toThrow();
  });

  it('treats nullable as a no-op token', () => {
    const schema = Validator.rulesToSchema({ note: 'nullable|string' });
    expect(Validator.isValid({ note: 'ok' }, schema)).toBe(true);
    expect(Validator.isValid({}, schema)).toBe(false);
  });

  it('keeps schema API working alongside rulesToSchema', () => {
    const schema = Schema.create().required('name').string('name');
    expect(Validator.isValid({ name: 'x' }, schema)).toBe(true);
  });
});
