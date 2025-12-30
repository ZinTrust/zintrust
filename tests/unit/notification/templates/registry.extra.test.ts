import { describe, expect, it, vi } from 'vitest';

vi.mock('@templates', async () => ({ MarkdownRenderer: { render: vi.fn() } }));

const BLANK_SUBJECT_TEMPLATE = '<!-- subject:   -->\n\nHello!';
const joinPath = (...args: string[]) => args.join('/');

describe('Notification render failure', () => {
  it('throws validation error when subject is missing', async () => {
    vi.resetModules();
    vi.doMock('@node-singletons/fs', () => ({
      readFileSync: vi.fn().mockReturnValue(BLANK_SUBJECT_TEMPLATE),
    }));
    vi.doMock('@node-singletons/path', () => ({
      join: joinPath,
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
