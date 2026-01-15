import { tryDecodeURIComponent } from '@routing/common';
import { describe, expect, it } from 'vitest';

describe('routing common coverage', () => {
  it('returns original string when decode fails', () => {
    expect(tryDecodeURIComponent('%')).toBe('%');
  });
});
