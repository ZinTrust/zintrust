import { describe, expect, it } from 'vitest';

import * as nodePath from 'node:path';

import { resolveSafePath, tryDecodeURIComponent } from '@core-routes/common';

describe('patch coverage: routing/common', () => {
  it('tryDecodeURIComponent returns original when invalid', () => {
    expect(tryDecodeURIComponent('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('resolveSafePath blocks traversal and allows in-base', () => {
    const base = nodePath.resolve('/tmp/zintrust-base');

    expect(resolveSafePath(base, '../escape.txt')).toBeUndefined();

    const inside = resolveSafePath(base, 'a/b.txt');
    expect(inside).toBe(nodePath.resolve(base, 'a/b.txt'));
  });
});
