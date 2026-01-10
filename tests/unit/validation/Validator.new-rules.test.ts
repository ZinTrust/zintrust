import { Schema, Validator } from '@validation/Validator';
import { describe, expect, it } from 'vitest';

describe('Validator - New Validation Rules', () => {
  it('alphanumeric validates alphanumeric strings', () => {
    const schema = Schema.create().alphanumeric('username');
    expect(Validator.validate({ username: 'JohnDoe123' }, schema)).toEqual({
      username: 'JohnDoe123',
    });
    expect(Validator.validate({ username: 'ABC' }, schema)).toEqual({ username: 'ABC' });
  });

  it('alphanumeric rejects non-alphanumeric strings', () => {
    const schema = Schema.create().alphanumeric('username');
    expect(() => Validator.validate({ username: 'John-Doe' }, schema)).toThrow();
    expect(() => Validator.validate({ username: 'John Doe' }, schema)).toThrow();
    expect(() => Validator.validate({ username: 'John@Doe' }, schema)).toThrow();
  });

  it('alphanumeric works with rule string syntax', () => {
    const schema = Validator.rulesToSchema({ username: 'alphanumeric' });
    expect(Validator.validate({ username: 'Valid123' }, schema)).toEqual({
      username: 'Valid123',
    });
    expect(() => Validator.validate({ username: 'Invalid-123' }, schema)).toThrow();
  });

  it('uuid validates UUID format', () => {
    const schema = Schema.create().uuid('id');
    const id1 = '550e8400-e29b-41d4-a716-446655440000';
    const id2 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    expect(Validator.validate({ id: id1 }, schema)).toEqual({ id: id1 });
    expect(Validator.validate({ id: id2 }, schema)).toEqual({ id: id2 });
  });

  it('uuid rejects invalid UUID format', () => {
    const schema = Schema.create().uuid('id');
    expect(() => Validator.validate({ id: 'not-a-uuid' }, schema)).toThrow();
    expect(() => Validator.validate({ id: '550e8400-e29b-41d4-a716' }, schema)).toThrow();
  });

  it('token validates token format', () => {
    const schema = Schema.create().token('apiKey');
    expect(Validator.validate({ apiKey: 'abc123-DEF-456_789' }, schema)).toEqual({
      apiKey: 'abc123-DEF-456_789',
    });
    expect(Validator.validate({ apiKey: 'ValidToken123' }, schema)).toEqual({
      apiKey: 'ValidToken123',
    });
  });

  it('token rejects invalid token format', () => {
    const schema = Schema.create().token('apiKey');
    expect(() => Validator.validate({ apiKey: 'token@invalid' }, schema)).toThrow();
    expect(() => Validator.validate({ apiKey: 'token with spaces' }, schema)).toThrow();
  });

  it('ipAddress validates IPv4 addresses', () => {
    const schema = Schema.create().ipAddress('ip');
    expect(Validator.validate({ ip: '192.168.1.1' }, schema)).toEqual({ ip: '192.168.1.1' });
    expect(Validator.validate({ ip: '10.0.0.1' }, schema)).toEqual({ ip: '10.0.0.1' });
    expect(Validator.validate({ ip: '255.255.255.255' }, schema)).toEqual({
      ip: '255.255.255.255',
    });
  });

  it('ipAddress validates IPv6 addresses', () => {
    const schema = Schema.create().ipAddress('ip');
    const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    expect(Validator.validate({ ip: ipv6 }, schema)).toEqual({ ip: ipv6 });
  });

  it('ipAddress rejects invalid IP addresses', () => {
    const schema = Schema.create().ipAddress('ip');
    expect(() => Validator.validate({ ip: '256.1.1.1' }, schema)).toThrow();
    expect(() => Validator.validate({ ip: 'not-an-ip' }, schema)).toThrow();
  });

  it('ipAddress works with rule string syntax using alias', () => {
    const schema = Validator.rulesToSchema({ ip: 'ip' });
    expect(Validator.validate({ ip: '192.168.1.1' }, schema)).toEqual({ ip: '192.168.1.1' });
  });

  it('positiveNumber validates positive numbers', () => {
    const schema = Schema.create().positiveNumber('amount');
    expect(Validator.validate({ amount: 1 }, schema)).toEqual({ amount: 1 });
    expect(Validator.validate({ amount: 100.5 }, schema)).toEqual({ amount: 100.5 });
    expect(Validator.validate({ amount: 0.001 }, schema)).toEqual({ amount: 0.001 });
  });

  it('positiveNumber rejects zero and negative numbers', () => {
    const schema = Schema.create().positiveNumber('amount');
    expect(() => Validator.validate({ amount: 0 }, schema)).toThrow();
    expect(() => Validator.validate({ amount: -5 }, schema)).toThrow();
  });

  it('positiveNumber works with rule string syntax using alias', () => {
    const schema = Validator.rulesToSchema({ amount: 'positive' });
    expect(Validator.validate({ amount: 10 }, schema)).toEqual({ amount: 10 });
  });

  it('digits validates digit-only strings', () => {
    const schema = Schema.create().digits('code');
    expect(Validator.validate({ code: '123456' }, schema)).toEqual({ code: '123456' });
    expect(Validator.validate({ code: '0' }, schema)).toEqual({ code: '0' });
  });

  it('digits rejects non-digit strings', () => {
    const schema = Schema.create().digits('code');
    expect(() => Validator.validate({ code: '123.456' }, schema)).toThrow();
    expect(() => Validator.validate({ code: '12a34' }, schema)).toThrow();
  });

  it('decimal validates decimal strings', () => {
    const schema = Schema.create().decimal('price');
    expect(Validator.validate({ price: '123.45' }, schema)).toEqual({ price: '123.45' });
    expect(Validator.validate({ price: '100' }, schema)).toEqual({ price: '100' });
    expect(Validator.validate({ price: '0.99' }, schema)).toEqual({ price: '0.99' });
  });

  it('decimal rejects invalid decimal strings', () => {
    const schema = Schema.create().decimal('price');
    expect(() => Validator.validate({ price: 'abc' }, schema)).toThrow();
    expect(() => Validator.validate({ price: '12.34.56' }, schema)).toThrow();
  });

  it('url validates HTTP and HTTPS URLs', () => {
    const schema = Schema.create().url('website');
    expect(Validator.validate({ website: 'https://example.com' }, schema)).toEqual({
      website: 'https://example.com',
    });
    expect(Validator.validate({ website: 'http://test.org/path?query=1' }, schema)).toEqual({
      website: 'http://test.org/path?query=1',
    });
  });

  it('url rejects invalid URLs', () => {
    const schema = Schema.create().url('website');
    expect(() => Validator.validate({ website: 'not-a-url' }, schema)).toThrow();
    expect(() => Validator.validate({ website: 'ftp://example.com' }, schema)).toThrow();
  });

  it('phone validates international phone numbers', () => {
    const schema = Schema.create().phone('mobile');
    expect(Validator.validate({ mobile: '+1234567890' }, schema)).toEqual({
      mobile: '+1234567890',
    });
    expect(Validator.validate({ mobile: '+44 20 1234 5678' }, schema)).toEqual({
      mobile: '+44 20 1234 5678',
    });
    expect(Validator.validate({ mobile: '+1-555-123-4567' }, schema)).toEqual({
      mobile: '+1-555-123-4567',
    });
  });

  it('phone rejects invalid phone numbers', () => {
    const schema = Schema.create().phone('mobile');
    expect(() => Validator.validate({ mobile: 'not-a-phone' }, schema)).toThrow();
    expect(() => Validator.validate({ mobile: '1' }, schema)).toThrow();
  });

  it('date validates Date objects', () => {
    const schema = Schema.create().date('createdAt');
    const date1 = new Date();
    const date2 = new Date('2024-01-01');
    expect(Validator.validate({ createdAt: date1 }, schema)).toEqual({ createdAt: date1 });
    expect(Validator.validate({ createdAt: date2 }, schema)).toEqual({ createdAt: date2 });
  });

  it('date validates date strings', () => {
    const schema = Schema.create().date('createdAt');
    expect(Validator.validate({ createdAt: '2024-01-01' }, schema)).toEqual({
      createdAt: '2024-01-01',
    });
    expect(Validator.validate({ createdAt: '2024-01-01T10:00:00Z' }, schema)).toEqual({
      createdAt: '2024-01-01T10:00:00Z',
    });
  });

  it('date rejects invalid dates', () => {
    const schema = Schema.create().date('createdAt');
    expect(() => Validator.validate({ createdAt: 'not-a-date' }, schema)).toThrow();
    expect(() => Validator.validate({ createdAt: 'invalid' }, schema)).toThrow();
  });

  it('date rejects invalid Date objects', () => {
    const schema = Schema.create().date('createdAt');
    expect(() => Validator.validate({ createdAt: new Date('invalid') }, schema)).toThrow();
  });

  it('combined rules validates multiple new rules together', () => {
    const schema = Schema.create()
      .required('id')
      .uuid('id')
      .required('username')
      .alphanumeric('username')
      .required('website')
      .url('website');

    const validData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      username: 'JohnDoe123',
      website: 'https://example.com',
    };

    expect(Validator.validate(validData, schema)).toEqual(validData);
    expect(() =>
      Validator.validate({ id: 'not-a-uuid', username: 'John-Doe', website: 'not-a-url' }, schema)
    ).toThrow();
  });

  it('custom error messages supports custom messages for new rules', () => {
    const schema = Schema.create()
      .alphanumeric('username', 'Username can only contain letters and numbers')
      .uuid('id', 'Please provide a valid UUID');

    expect(() => Validator.validate({ username: 'John-Doe', id: 'invalid' }, schema)).toThrow();
  });
});
