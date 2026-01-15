import { isNodeMain } from '@/start';
import { describe, expect, it } from 'vitest';

describe('start coverage', () => {
  it('detects node main module', () => {
    const originalArgv = process.argv.slice();
    process.argv[1] = 'file:///tmp/app.js';

    expect(isNodeMain('file:///tmp/app.js')).toBe(true);

    process.argv = originalArgv;
  });
});
