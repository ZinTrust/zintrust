/**
 * MarkdownRenderer - Minimal, safe Markdown -> HTML renderer
 * - Plain functions only (no classes)
 * - Designed for emails and notifications
 * - Performs variable interpolation with HTML-escaping
 * - Basic markdown features: headings, bold, italic, lists, links, code blocks, inline code
 * - Safe link sanitization (only allow http(s), mailto, tel)
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import { XssProtection } from '@security/XssProtection';

const escapeHtml = (str: string): string => XssProtection.escape(str);

const sanitizeHref = (href: string): string => {
  const trimmed = String(href ?? '').trim();
  if (trimmed === '') return '#';
  if (XssProtection.isSafeUrl(trimmed) === false) return '#';
  const encoded = XssProtection.encodeHref(trimmed);
  if (encoded === '') return '#';
  return encoded;
};

const interpolate = (markdown: string, variables: Record<string, unknown> = {}): string => {
  return markdown.replaceAll(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_m: string, key: string) => {
    const val = variables[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
};

const renderInline = (text: string): string => {
  const BACKTICK = '__ZINTRUST_MD_BACKTICK__';

  // 1) Escape *all* user-provided text for safety, but preserve backticks so we can parse inline-code.
  // Backticks are not dangerous in HTML text context; they are only meaningful to our markdown parser.
  let out = String(text).replaceAll('`', BACKTICK);
  out = XssProtection.escape(out);
  out = out.replaceAll(BACKTICK, '`');

  // 2) Apply inline markdown transforms. Captured groups are already escaped.
  // Inline code
  out = out.replaceAll(/`([^`]+?)`/g, (_m: string, code: string) => `<code>${code}</code>`);

  // Links [text](url) - use a linear parser to avoid regex backtracking (prevents ReDoS)
  out = ((): string => {
    const s = out;
    let res = '';
    let i = 0;

    while (i < s.length) {
      const open = s.indexOf('[', i);
      if (open === -1) {
        res += s.slice(i);
        break;
      }

      const close = s.indexOf(']', open + 1);
      if (close === -1) {
        res += s.slice(i);
        break;
      }

      // only treat as link if '(' immediately follows ']'
      if (s[close + 1] !== '(') {
        res += s.slice(i, close + 1);
        i = close + 1;
        continue;
      }

      const paren = close + 1;
      const end = s.indexOf(')', paren + 1);
      if (end === -1) {
        res += s.slice(i);
        break;
      }

      const txt = s.slice(open + 1, close);
      const url = s.slice(paren + 1, end);
      const safeHref = sanitizeHref(url);

      res +=
        s.slice(i, open) +
        `<a href="${safeHref}" rel="noopener noreferrer" target="_blank">${txt}</a>`;
      i = end + 1;
    }

    return res;
  })();

  // Bold **text**
  out = out.replaceAll(/\*\*([^*]+?)\*\*/g, (_m: string, t: string) => `<strong>${t}</strong>`);

  // Italic *text* or _text_
  out = out.replaceAll(/\*([^*]+?)\*/g, (_m: string, t: string) => `<em>${t}</em>`);
  out = out.replaceAll(/_([^_]+?)_/g, (_m: string, t: string) => `<em>${t}</em>`);

  return out;
};

// Top-level helpers to keep parseMarkdown small
function handleHeading(line: string, out: string[]): boolean {
  // Parse headings without regex to avoid any possibility of super-linear backtracking (ReDoS).
  if (line.length === 0 || !line.startsWith('#')) return false;

  let level = 0;
  while (level < line.length && level < 6 && line[level] === '#') level++;

  // Not a heading if there are more than 6 leading hashes (e.g., ####### ...)
  if (level === 0) return false;
  if (level < line.length && line[level] === '#') return false;

  // Require at least one whitespace after the hashes (Markdown-style "# Heading")
  if (level >= line.length) return false;
  if (line[level] !== ' ' && line[level] !== '\t') return false;

  let i = level;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;

  const content = renderInline(line.slice(i).trimEnd());
  out.push(`<h${level}>${content}</h${level}>`);
  return true;
}

function parseUnorderedListItemContent(line: string): string | null {
  // Parse without regex to guarantee linear runtime and avoid ReDoS/backtracking issues (sonarqube:S5852).
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;

  if (i >= line.length) return null;

  const bullet = line[i];
  if (bullet !== '-' && bullet !== '+' && bullet !== '*') return null;

  i++; // after bullet
  if (i >= line.length) return null;

  // Require whitespace after bullet
  if (line[i] !== ' ' && line[i] !== '\t') return null;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;

  const content = line.slice(i);
  if (content.length === 0) return null;

  return content;
}

function ensureUnorderedListOpen(state: { inUl: boolean; inOl: boolean }, out: string[]): void {
  if (state.inUl) return;

  // close other lists
  if (state.inOl) {
    out.push('</ol>');
    state.inOl = false;
  }

  state.inUl = true;
  out.push('<ul>');
}

function handleUnordered(
  line: string,
  state: { inUl: boolean; inOl: boolean },
  out: string[]
): boolean {
  const content = parseUnorderedListItemContent(line);
  if (content === null) return false;

  ensureUnorderedListOpen(state, out);
  out.push(`<li>${renderInline(content.trim())}</li>`);
  return true;
}

function skipSpacesAndTabs(line: string, start: number): number {
  let i = start;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return i;
}

function readAsciiDigitsEnd(line: string, start: number): number {
  let i = start;
  while (i < line.length) {
    const c = line.codePointAt(i) ?? 0;
    if (c < 48 || c > 57) break;
    i++;
  }
  return i;
}

function parseOrderedListItemContent(line: string): string | null {
  // Parse without regex to guarantee linear runtime and avoid ReDoS/backtracking issues (sonarqube:S5852).
  let i = skipSpacesAndTabs(line, 0);

  const digitsEnd = readAsciiDigitsEnd(line, i);
  if (digitsEnd === i) return null; // no digits
  i = digitsEnd;

  if (i >= line.length || line[i] !== '.') return null;
  i++; // after '.'

  // Require whitespace after "1."
  if (i >= line.length || (line[i] !== ' ' && line[i] !== '\t')) return null;
  i = skipSpacesAndTabs(line, i);

  const content = line.slice(i);
  return content.length === 0 ? null : content;
}

function handleOrdered(
  line: string,
  state: { inUl: boolean; inOl: boolean },
  out: string[]
): boolean {
  const content = parseOrderedListItemContent(line);
  if (content === null) return false;

  if (!state.inOl) {
    if (state.inUl) {
      out.push('</ul>');
      state.inUl = false;
    }
    state.inOl = true;
    out.push('<ol>');
  }

  out.push(`<li>${renderInline(content.trim())}</li>`);
  return true;
}

function handleParagraph(
  line: string,
  state: { inUl: boolean; inOl: boolean },
  out: string[]
): void {
  if (/^\s*$/.test(line)) {
    if (state.inUl) {
      out.push('</ul>');
      state.inUl = false;
    }
    if (state.inOl) {
      out.push('</ol>');
      state.inOl = false;
    }
    out.push('');
    return;
  }
  const paragraph = `<p>${renderInline(line.trim())}</p>`;
  out.push(paragraph);
}

function parseMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];

  type State = {
    inCodeBlock: boolean;
    codeLang: string;
    codeBuffer: string[];
    inUl: boolean;
    inOl: boolean;
  };

  const state: State = {
    inCodeBlock: false,
    codeLang: '',
    codeBuffer: [],
    inUl: false,
    inOl: false,
  };

  function handleCodeFence(line: string): boolean {
    // Limit the length of the optional language identifier to avoid pathological inputs
    const m = /^```\s*([a-zA-Z0-9_-]{0,20})$/.exec(line);
    if (!m) return false;

    if (state.inCodeBlock) {
      const codeHtml = escapeHtml(state.codeBuffer.join('\n'));
      if (state.codeLang) {
        out.push(
          `<pre><code class="language-${escapeHtml(state.codeLang)}">${codeHtml}</code></pre>`
        );
      } else {
        out.push(`<pre><code>${codeHtml}</code></pre>`);
      }
      state.inCodeBlock = false;
      state.codeLang = '';
      state.codeBuffer = [];
      return true;
    }

    // open code fence
    state.inCodeBlock = true;
    state.codeLang = m[1] || '';
    state.codeBuffer = [];
    return true;
  }

  for (const rawLine of lines) {
    const line = rawLine;

    if (handleCodeFence(line)) continue;

    if (state.inCodeBlock) {
      state.codeBuffer.push(line);
      continue;
    }

    if (handleHeading(line, out)) continue;
    if (handleUnordered(line, state, out)) continue;
    if (handleOrdered(line, state, out)) continue;
    handleParagraph(line, state, out);
  }

  // Close any remaining lists or code blocks
  if (state.inCodeBlock) {
    const codeHtml = escapeHtml(state.codeBuffer.join('\n'));
    out.push(`<pre><code>${codeHtml}</code></pre>`);
  }
  if (state.inUl) out.push('</ul>');
  if (state.inOl) out.push('</ol>');

  return out.filter((l) => l !== '').join('\n');
}

export const MarkdownRenderer = Object.freeze({
  render(markdown: string, variables: Record<string, unknown> = {}): string {
    if (typeof markdown !== 'string') {
      throw ErrorFactory.createValidationError('Markdown must be a string', {
        type: typeof markdown,
      });
    }
    const interpolated = interpolate(markdown, variables);
    return parseMarkdown(interpolated);
  },

  renderWithLayout(
    markdown: string,
    layout: 'email' | 'notification' = 'email',
    variables: Record<string, unknown> = {}
  ): string {
    const content = MarkdownRenderer.render(markdown, variables);
    if (layout === 'notification') {
      // Minimal wrapper for notifications
      return `<div class="notification">${content}</div>`;
    }

    // Email layout
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif;font-size:16px;color:#111;margin:0;padding:0} .email{max-width:680px;margin:20px auto;padding:24px;border:1px solid #eee;background:#fff}</style>
  </head><body><div class="email">${content}</div></body></html>`;
  },
});

export default MarkdownRenderer;
