---
title: Markdown Templates
description: Rendering and usage of Markdown templates for Mail and Notifications
---

# Markdown Templates

This page documents the `MarkdownRenderer` used by Mail and Notification templates.

It covers:

- Rendering Markdown to safe HTML (emails + notifications)
- Template metadata (`<!-- Subject: ... -->`, variables, preheader)
- Built-in registries for Mail and Notification templates
- Variable interpolation rules and safety guarantees

## Import

```typescript
import { MarkdownRenderer } from '@templates/MarkdownRenderer';
```

## Usage

Render markdown to HTML:

```typescript
const html = MarkdownRenderer.render('# Hello {{name}}', { name: 'Alice' });
```

Render with an email layout wrapper:

```typescript
const emailHtml = MarkdownRenderer.renderWithLayout('# Welcome', 'email', { name: 'Bob' });
```

## Template registries

Zintrust includes lightweight registries that load `.md` templates from the framework template folders.

### Mail templates

```ts
import { listTemplates, renderTemplate } from '@mail/templates/markdown';

const names = listTemplates();
const { html, meta } = renderTemplate('auth/welcome', {
  name: 'Alice',
  confirmLink: 'https://example.com/verify',
  expiryMinutes: 30,
});

// meta.subject / meta.preheader / meta.variables
```

### Notification templates

```ts
import { listTemplates, renderTemplate } from '@notification/templates/markdown';

const names = listTemplates();
const { html, meta } = renderTemplate('notifications/new-follow', {
  name: 'Alice',
  follower: 'Bob',
});
```

## Template format

Templates start with optional top-of-file HTML comments that act as metadata.

Example:

```md
<!-- Subject: Welcome to MyApp -->
<!-- Preheader: Thanks for joining -->
<!-- Variables: name, confirmLink, expiryMinutes -->

# Welcome, {{name}}!

Please verify your email:

[Verify Email]({{confirmLink}})

_This link expires in {{expiryMinutes}} minutes._
```

## Variable interpolation

- Syntax: `{{variableName}}`
- Missing variables resolve to an empty string
- Values are HTML-escaped at render time to prevent injection

## Features

- Variable interpolation using `{{variable}}` syntax
- Basic Markdown: headings, bold, italic, lists, links, inline code, fenced code blocks
- `renderWithLayout(..., 'email')` returns a minimal email-friendly HTML wrapper

## Security

- HTML escaping and URL handling are centralized in `XssProtection`.
- Links are sanitized: `http`, `https`, `mailto`, `tel`, and safe relative URLs are allowed; others become `#`.
- Interpolated values are escaped to prevent HTML injection.

## Tests

Unit tests: `tests/unit/templates/MarkdownRenderer.test.ts` (covers rendering, interpolation and sanitization)
