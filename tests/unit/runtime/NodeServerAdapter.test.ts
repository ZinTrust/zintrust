import { NodeServerAdapter } from '@/runtime/adapters/NodeServerAdapter';
import { describe, expect, it } from 'vitest';

describe('NodeServerAdapter', () => {
  it('should identify as nodejs platform', () => {
    const adapter = NodeServerAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.platform).toBe('nodejs');
  });
});
