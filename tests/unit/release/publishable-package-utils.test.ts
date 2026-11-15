import { describe, expect, it } from 'vitest';

import { isPublishableFromNpmState } from '../../../scripts/ci/publishable-package-utils.mjs';

describe('publishable package selection', () => {
  it('does not publish an unchanged package just because it is unpublished', () => {
    expect(isPublishableFromNpmState('db-mysql', '3.8.0', null, new Set())).toBe(false);
  });

  it('allows a changed package to be published for the first time', () => {
    expect(isPublishableFromNpmState('db-mysql', '3.8.0', null, new Set(['db-mysql']))).toBe(true);
  });

  it('publishes a changed package only when its version is newer', () => {
    const changedDirs = new Set(['db-mysql']);

    expect(isPublishableFromNpmState('db-mysql', '3.8.1', '3.8.0', changedDirs)).toBe(true);
    expect(isPublishableFromNpmState('db-mysql', '3.8.0', '3.8.0', changedDirs)).toBe(false);
    expect(isPublishableFromNpmState('db-mysql', '3.7.9', '3.8.0', changedDirs)).toBe(false);
  });

  it('preserves unrestricted selection when no changed-package list is provided', () => {
    expect(isPublishableFromNpmState('db-mysql', '3.8.0', null, undefined)).toBe(true);
  });
});
