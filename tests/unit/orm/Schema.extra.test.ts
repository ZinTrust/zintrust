import { Schema } from '@orm/Schema';
import { describe, expect, it } from 'vitest';

describe('Schema extra', () => {
  it('should set length when provided to string()', () => {
    const schema = Schema.create('users');
    const col = schema.string('name', 255);
    expect(col.getDefinition().length).toBe(255);
  });
});
