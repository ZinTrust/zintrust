import { PROFILING_TYPES_MODULE } from '@profiling/types';
import { describe, expect, it } from 'vitest';

describe('profiling/types', () => {
  it('exports a runtime marker', () => {
    expect(PROFILING_TYPES_MODULE).toBe('ProfilingTypes');
  });
});
