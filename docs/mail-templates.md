# Mail Markdown Templates 🔧

This module provides a lightweight registry and loader for mail templates written in Markdown.

## Key utilities

- `loadTemplate(name: string)` — Load a template from `src/tools/mail/templates/markdown/<name>.md`.
  - Returns: `{ content, subject?, preheader?, variables? }`
- `listTemplates()` — Returns an array of available template names (e.g. `auth/welcome`).
- `renderTemplate(name, vars)` — Renders a template to HTML using the `MarkdownRenderer` and interpolates variables.
  - Returns: `{ html, meta }` where `meta` is the template metadata from `loadTemplate()`.

## Example

```ts
import { renderTemplate, listTemplates } from '@zintrust/core/node';

const templates = listTemplates();
const { html, meta } = renderTemplate('auth/welcome', {
  name: 'Alice',
  confirmLink: 'https://example.com',
});
console.log(meta.subject);
console.log(html);
```

## Template format

Place templates under `src/tools/mail/templates/markdown/<category>/<name>.md`.
Top-of-file HTML comments are parsed as metadata:

<!-- Subject: Welcome to MyApp -->
<!-- Preheader: Thanks for joining -->
<!-- Variables: name, confirmLink -->

Then Markdown content follows.

---

**Tip:** Use `MarkdownRenderer.render(content, { ...vars })` directly if you need custom rendering options.
