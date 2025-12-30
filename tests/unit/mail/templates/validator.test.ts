import { loadTemplate } from '@mail/templates/markdown';
import { validateTemplateMeta } from '@mail/templates/markdown/validator';
import { describe, expect, it } from 'vitest';

describe('Mail Template Validator', () => {
  it('throws when subject is missing', () => {
    const tpl = { content: '# Hello {{name}}', variables: ['name'] } as any;
    expect(() => validateTemplateMeta('bad/template', tpl)).toThrow();
  });

  it('throws when variables mismatch', () => {
    const tpl = { subject: 'Hi', content: 'Hello {{first}} {{last}}', variables: ['first'] } as any;
    expect(() => validateTemplateMeta('mismatch/template', tpl)).toThrow();
  });

  it('validates a good template', () => {
    const tpl = loadTemplate('transactional/password-reset');
    expect(validateTemplateMeta('transactional/password-reset', tpl)).toBe(true);
  });
});
