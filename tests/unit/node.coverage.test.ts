import { describe, expect, it } from 'vitest';

describe('node exports coverage', () => {
  it('imports node entrypoint without throwing', async () => {
    const mod = await import('@/node');
    expect(mod).toBeDefined();
  });
});
