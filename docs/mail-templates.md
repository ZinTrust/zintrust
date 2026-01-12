# Mail Markdown Templates

ZinTrust ships a lightweight Markdown template registry for mail templates.

It is intentionally simple:

- templates are `.md` files on disk
- metadata is parsed from top-of-file HTML comments
- variables are interpolated using `{{variable}}` placeholders
- output HTML is produced by the safe `MarkdownRenderer`

## Where templates live

The built-in registry reads templates from the project working directory:

- `src/tools/mail/templates/markdown/**` (relative to `process.cwd()`)

Template names use slash-separated paths without the `.md` extension:

- `auth/welcome`
- `transactional/password-reset`

## Public API

In Node contexts (CLI, server-side rendering), import from the node entrypoint:

```ts
import { listTemplates, loadTemplate, renderTemplate } from '@zintrust/core/node';
```

The key functions are:

- `listTemplates()` → `string[]`
  - walks `src/tools/mail/templates/markdown` and returns normalized names (lowercased, no extension)
- `loadTemplate(name)` → `{ subject?, preheader?, variables?, content }`
  - reads `src/tools/mail/templates/markdown/<name>.md` and parses metadata
- `renderTemplate(name, vars?)` → `{ html, meta }`
  - loads template, validates metadata, then renders `content` to HTML

## Example

```ts
import { listTemplates, renderTemplate } from '@zintrust/core/node';

const templates = listTemplates();

const { html, meta } = renderTemplate('auth/welcome', {
  name: 'Alice',
  confirmLink: 'https://example.com/verify',
  expiryMinutes: 30,
});

console.log(templates);
console.log(meta.subject);
console.log(html);
```

## Template format (metadata + Markdown)

Templates start with **optional** top-of-file HTML comment lines that look like:

```md
<!-- Subject: Welcome, {{name}}! -->
<!-- Preheader: Thanks for joining -->
<!-- Variables: name, confirmLink, expiryMinutes -->
```

Parsing rules:

- metadata lines must be consecutive at the top of the file
- each metadata line must be an HTML comment with a `Key: Value` shape
- parsing stops at the first non-matching line

After metadata, the Markdown body begins.

## Variable rules and validation

ZinTrust supports placeholders of the form:

- `{{name}}`
- `{{ name }}`

For mail templates, `renderTemplate(...)` validates metadata using `validateTemplateMeta(...)`:

- `subject` is required (missing/empty subject throws a validation error)
- the `Variables: ...` list must match placeholders found in the body
  - if metadata declares variables that do not appear in the content, rendering fails
  - if the content contains placeholders not declared in metadata, rendering fails

This strictness is intentional: it prevents templates from silently drifting.

## Rendering behavior

`renderTemplate(...)` uses `MarkdownRenderer.render(...)` under the hood.

- interpolated values are HTML-escaped to reduce injection risk
- links are sanitized so only safe protocols are emitted

If you want an email-friendly wrapper document, use the renderer directly:

```ts
import { loadTemplate } from '@zintrust/core/node';
import { MarkdownRenderer } from '@zintrust/core';

const tpl = loadTemplate('auth/welcome');
const html = MarkdownRenderer.renderWithLayout(tpl.content, 'email', { name: 'Alice' });
```

## CLI support

ZinTrust includes a CLI command for listing and rendering templates:

```bash
zin templates list mail
zin templates render mail auth/welcome
```

`scope` can be `mail`, `notification`, or `all`.

## Scaffolding new templates

The CLI can scaffold **application-owned** templates into `src/mail/markdown`:

```bash
zin make:mail-template welcome --category auth --vars name,confirmLink,expiryMinutes
```

Note: the built-in registry documented above reads from `src/tools/mail/templates/markdown`. If you want your new template to appear in `zin templates list`, either:

- place/copy it under `src/tools/mail/templates/markdown/<category>/<name>.md`, or
- implement your own loader that targets `src/mail/markdown`.
