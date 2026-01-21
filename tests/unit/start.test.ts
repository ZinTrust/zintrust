import { afterEach, describe, expect, it } from 'vitest';

import { isNodeMain } from '@/start';

describe('start helpers', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('returns true when argv path matches import meta url', () => {
    process.argv = ['node', '/tmp/app.js'];
    expect(isNodeMain('file:///tmp/app.js')).toBe(true);
  });

  it('returns false when argv is missing', () => {
    process.argv = ['node'];
    expect(isNodeMain('file:///tmp/app.js')).toBe(false);
  });

  it('returns true when argv ends with import meta path', () => {
    process.argv = ['node', '/tmp/app.js'];
    expect(isNodeMain('/tmp/app.js')).toBe(true);
  });
});
