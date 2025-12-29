import { describe, expect, it, vi } from 'vitest';

vi.mock('@templates', async () => ({ MarkdownRenderer: { render: vi.fn() } }));

describe('Notification render failure', () => {
  it('throws validation error when subject is missing', async () => {
    vi.resetModules();
    vi.doMock('@node-singletons/fs', () => ({
      readFileSync: vi.fn(() => '<!-- subject:   -->\n\nHello!'),
    }));
    vi.doMock('@node-singletons/path', () => ({
      join: (...args: string[]) => args.join('/'),
    }));

    const { renderTemplate } = await import('@notification/templates/markdown');

    expect(() => renderTemplate('notifications/blank-subject')).toThrow();
    try {
      renderTemplate('notifications/blank-subject');
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      expect(e.code).toBe('VALIDATION_ERROR');
    }

    vi.doUnmock('@node-singletons/fs');
    vi.doUnmock('@node-singletons/path');
  });
});
