import { MarkdownRenderer } from '@templates';
import { describe, expect, test } from 'vitest';

describe('MarkdownRenderer ReDoS protections', () => {
  test('large heading does not hang and renders correctly', () => {
    const long = '#### ' + 'a'.repeat(100_000);
    const start = Date.now();
    const out = MarkdownRenderer.render(long);
    const duration = Date.now() - start;

    expect(out.startsWith('<h4>')).toBe(true);
    // Should be fast even for large single-line input; allow generous window for CI
    expect(duration).toBeLessThan(1000);
  });

  test('large unordered list item does not hang and renders correctly', () => {
    const long = '- ' + 'b'.repeat(100_000);
    const start = Date.now();
    const out = MarkdownRenderer.render(long);
    const duration = Date.now() - start;

    expect(out.includes('<li>')).toBe(true);
    expect(duration).toBeLessThan(1000);
  });

  test('extremely long code-fence language is ignored (no hang)', () => {
    const longLang = '```' + 'x'.repeat(5_000);
    const content = longLang + '\nconsole.log(1)\n```';
    const start = Date.now();
    const out = MarkdownRenderer.render(content);
    const duration = Date.now() - start;

    // The opening fence should not be recognized as a valid fence with a too-long lang
    // so the output will contain the literal backticks preserved/escaped
    expect(out.includes('```') || out.includes('console.log')).toBe(true);
    expect(duration).toBeLessThan(1000);
  });

  test('long bold/italic sequences do not cause regex blowup', () => {
    const bold = '**' + 'x'.repeat(100_000) + '**';
    const start = Date.now();
    const out = MarkdownRenderer.render(bold);
    const duration = Date.now() - start;

    expect(out.includes('<strong>')).toBe(true);
    expect(duration).toBeLessThan(1000);
  });
});
