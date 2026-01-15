import { BodyParsers } from '@http/parsers/BodyParsers';
import { describe, expect, it } from 'vitest';

describe('BodyParsers coverage', () => {
  it('parses CSV payloads', () => {
    const res = BodyParsers.parse('text/csv', 'name,age\nAda,42');
    expect(res.ok).toBe(true);
    expect(res.data).toEqual([{ name: 'Ada', age: '42' }]);
  });
});
