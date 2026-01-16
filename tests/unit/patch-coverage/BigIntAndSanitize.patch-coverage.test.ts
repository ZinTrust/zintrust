import { describe, expect, it } from 'vitest';

import { BaseAdapter } from '@orm/DatabaseAdapter';
import { createModel } from '@orm/Model';

describe('BigInt and sanitize support', () => {
  it('sanitize handles BigInt and Date without throwing', () => {
    const bi = 1234567890123456789n;
    const s = BaseAdapter.sanitize(bi);
    expect(s).toBe('1234567890123456789');

    const d = new Date('2020-01-01T00:00:00.000Z');
    const ds = BaseAdapter.sanitize(d);
    expect(ds).toBe("'2020-01-01T00:00:00.000Z'");
  });

  it('model toJSON serializes BigInt to string', () => {
    const cfg: any = {
      table: 't',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
    };

    const m = createModel(cfg, { id: 9007199254740993n, name: 'x' } as any);
    const json = m.toJSON();
    expect(json['id']).toBe('9007199254740993');
    expect(json['name']).toBe('x');
  });

  it('model casts BigInt and UUID', () => {
    const cfg: any = {
      table: 't',
      fillable: ['b_id', 'u_id'],
      casts: {
        b_id: 'bigint',
        u_id: 'uuid',
      },
    };

    const m = createModel(cfg, {});

    // Test BigInt casting from String
    m.setAttribute('b_id', '1234567890123456789');
    expect(m.getAttribute('b_id')).toBe(1234567890123456789n);

    // Test BigInt casting from Number
    m.setAttribute('b_id', 123);
    expect(m.getAttribute('b_id')).toBe(123n);

    // Test UUID casting (ensure it stays string)
    m.setAttribute('u_id', '550e8400-e29b-41d4-a716-446655440000');
    expect(m.getAttribute('u_id')).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
});
