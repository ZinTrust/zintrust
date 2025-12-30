import { execFileSync } from '@node-singletons/child-process';
import { describe, expect, it } from 'vitest';

describe('node-singletons/child-process', () => {
  it('exports execFileSync as a function', () => {
    expect(typeof execFileSync).toBe('function');
  });
});
