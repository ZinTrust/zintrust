import { DateTime } from '@time/DateTime';
import { describe, expect, it } from 'vitest';

describe('DateTime coverage', () => {
  it('formats relative time for past dates', () => {
    const base = DateTime.create(new Date('2020-01-02T00:00:00.000Z'));
    const other = new Date('2020-01-01T00:00:00.000Z');
    const rel = base.relative(other);
    expect(rel).toContain('ago');
  });
});
