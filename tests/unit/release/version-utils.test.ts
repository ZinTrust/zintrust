import { describe, expect, it } from 'vitest';

import {
  getNextVersionFromPublished,
  incrementPatchVersion,
} from '../../../scripts/release/version-utils.mjs';

describe('release version utils', () => {
  it('increments a published patch version one step at a time', () => {
    expect(incrementPatchVersion('0.9.2')).toBe('0.9.3');
    expect(incrementPatchVersion('0.9.3')).toBe('0.9.4');
    expect(incrementPatchVersion('1.8.8')).toBe('1.8.9');
  });

  it('applies the ZinTrust carry rule when patch reaches 9', () => {
    expect(incrementPatchVersion('0.9.9')).toBe('1.0.0');
    expect(incrementPatchVersion('1.8.9')).toBe('1.9.0');
    expect(incrementPatchVersion('1.9.9')).toBe('2.0.0');
  });

  it('bumps to the next published patch without skipping ahead', () => {
    expect(getNextVersionFromPublished('0.9.2', '0.9.2')).toBe('0.9.3');
    expect(getNextVersionFromPublished('0.9.2', '0.9.4')).toBe('0.9.4');
    expect(getNextVersionFromPublished('1.9.9', '1.9.9')).toBe('2.0.0');
  });
});
