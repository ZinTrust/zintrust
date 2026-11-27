import { describe, expect, it } from 'vitest';

import {
  PINNED_GOVERNANCE_SCAFFOLDER_VERSION,
  extractMajorMinorVersion,
  toCompatibleGovernanceVersion,
} from '@cli/scaffolding/ScaffoldingVersionUtils';

describe('ScaffoldingVersionUtils branches', () => {
  it.each([
    ['1.2.3', { major: '1', minor: '2' }],
    ['  v2.7.9-beta ', { major: '2', minor: '7' }],
    ['prefix-3.4.5+build', { major: '3', minor: '4' }],
    ['10.20.30', { major: '10', minor: '20' }],
  ])('extracts major/minor from %s', (value, expected) => {
    expect(extractMajorMinorVersion(value as string)).toEqual(expected);
  });

  it.each(['', '   ', 'vX.Y.Z', '1.2', '1..3', '.2.3', '1.2.', 'a-b-c'])(
    'returns undefined for %s',
    (value) => {
      expect(extractMajorMinorVersion(value)).toBeUndefined();
    }
  );

  it('toCompatibleGovernanceVersion uses parsed version or fallback', () => {
    expect(toCompatibleGovernanceVersion('^4.2.0')).toBe('^4.2.2');
    expect(toCompatibleGovernanceVersion('nope')).toBe('^1.0.0');
    expect(toCompatibleGovernanceVersion('nope', 'custom')).toBe('custom');
    expect(PINNED_GOVERNANCE_SCAFFOLDER_VERSION).toBe('^1.2.0');
  });
});
