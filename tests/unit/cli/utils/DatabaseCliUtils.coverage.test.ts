import { describe, expect, it } from 'vitest';

import { mapConnectionToOrmConfig } from '@cli/utils/DatabaseCliUtils';

describe('DatabaseCliUtils (coverage extras)', () => {
  it('maps d1 connection to ORM config', () => {
    const out = mapConnectionToOrmConfig({ driver: 'd1' });
    expect(out).toEqual({ driver: 'd1' });
  });
});
