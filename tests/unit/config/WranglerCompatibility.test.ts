import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const parseJsonc = (value: string): Record<string, unknown> => {
  const withoutBlock = value.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLine = withoutBlock.replace(/^\s*\/\/.*$/gm, '');
  const withoutTrailingCommas = withoutLine.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(withoutTrailingCommas) as Record<string, unknown>;
};

describe('wrangler compatibility settings', () => {
  it('keeps compatibility_date at or above 2024-01-15 and nodejs_compat enabled', () => {
    const content = readFileSync('wrangler.jsonc', 'utf-8');
    const parsed = parseJsonc(content);
    const date = String(parsed.compatibility_date ?? '');
    const flags = Array.isArray(parsed.compatibility_flags)
      ? parsed.compatibility_flags.map(String)
      : [];

    expect(date).toBeTruthy();
    expect(date >= '2024-01-15').toBe(true);
    expect(flags).toContain('nodejs_compat');
  });
});
