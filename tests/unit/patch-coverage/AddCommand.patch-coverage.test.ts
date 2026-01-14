import { describe, expect, it, vi } from 'vitest';

describe('AddCommand helpers', () => {
  it('getDefaultResponseFields returns expected fields for known types', async () => {
    vi.resetModules();

    const mod = await import('../../../../src/cli/commands/AddCommand');
    const fn = mod.AddCommand._helpers.getDefaultResponseFields;

    const success = fn('success');
    const error = fn('error');
    const paginated = fn('paginated');

    expect(Array.isArray(success)).toBe(true);
    expect(success.length).toBeGreaterThan(0);
    expect(error.find((f: any) => f.name === 'code')).toBeDefined();
    expect(paginated.find((f: any) => f.name === 'id')).toBeDefined();
  });
});
