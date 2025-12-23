import { DenoAdapter } from '@/runtime/adapters/DenoAdapter';
import { describe, expect, it } from 'vitest';

describe('DenoAdapter', () => {
  it('should identify as deno platform', () => {
    const adapter = DenoAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.platform).toBe('deno');
  });
});
