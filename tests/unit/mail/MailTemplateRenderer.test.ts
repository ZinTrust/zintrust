import { describe, expect, it } from 'vitest';

import { MailTemplateRenderer } from '@mail/templates';

describe('MailTemplateRenderer', () => {
  it('renders placeholders in subject/text/html', () => {
    const tpl = {
      subject: 'Hi {{name}}',
      text: 'Hello {{ name }}',
      html: '<p>{{name}}</p>',
    };

    const out = MailTemplateRenderer.render(tpl, { name: 'Alice' });

    expect(out.subject).toBe('Hi Alice');
    expect(out.text).toBe('Hello Alice');
    expect(out.html).toBe('<p>Alice</p>');
  });
});
