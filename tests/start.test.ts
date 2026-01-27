import { describe, expect, it } from 'vitest';

import { isNodeMain } from '@/start';

describe('start utilities', () => {
  it('detects when module is node main', () => {
    const originalArgv = process.argv;
    process.argv = ['node', '/app/dist/src/start.js'];

    const result = isNodeMain('file:///app/dist/src/start.js');
    expect(result).toBe(true);

    process.argv = originalArgv;
  });

  it('returns false when module is not main', () => {
    const originalArgv = process.argv;
    process.argv = ['node', '/app/dist/src/other.js'];

    const result = isNodeMain('file:///app/dist/src/start.js');
    expect(result).toBe(false);

    process.argv = originalArgv;
  });
});
