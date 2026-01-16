import { PackageTyps } from '@config/type';
import { describe, expect, it } from 'vitest';

describe('config type coverage', () => {
  it('exposes package type constants', () => {
    expect(PackageTyps.Storage).toBe('Storage');
  });
});
