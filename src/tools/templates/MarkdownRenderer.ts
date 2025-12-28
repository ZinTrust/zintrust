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

  // Links [text](url)
  out = out.replaceAll(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_m: string, txt: string, url: string) => {
    const safeHref = sanitizeHref(url);
    return `<a href="${safeHref}" rel="noopener noreferrer" target="_blank">${txt}</a>`;
  });

  // Bold **text**
  out = out.replaceAll(/\*\*([^*]+?)\*\*/g, (_m: string, t: string) => `<strong>${t}</strong>`);

  // Italic *text* or _text_
  out = out.replaceAll(/\*([^*]+?)\*/g, (_m: string, t: string) => `<em>${t}</em>`);
  out = out.replaceAll(/_([^_]+?)_/g, (_m: string, t: string) => `<em>${t}</em>`);

  return out;
};

// Top-level helpers to keep parseMarkdown small
function handleHeading(line: string, out: string[]): boolean {
  const headingMatch = new RegExp(/^(#{1,6})\s+(.*)$/).exec(line);
  if (!headingMatch) return false;
  const level = headingMatch[1].length;
  const content = renderInline(headingMatch[2].trim());
  out.push(`<h${level}>${content}</h${level}>`);
  return true;
}

function handleUnordered(
  line: string,
  state: { inUl: boolean; inOl: boolean },
  out: string[]
): boolean {
  const ulMatch = new RegExp(/^\s*[-+*]\s+(.*)$/).exec(line);
  if (!ulMatch) return false;
  if (!state.inUl) {
    // close other lists
    if (state.inOl) {
      out.push('</ol>');
      state.inOl = false;
    }
    state.inUl = true;
    out.push('<ul>');
  }
  out.push(`<li>${renderInline(ulMatch[1].trim())}</li>`);
  return true;
}

function handleOrdered(
  line: string,
  state: { inUl: boolean; inOl: boolean },
  out: string[]
): boolean {
  const olMatch = new RegExp(/^\s*\d+\.\s+(.*)$/).exec(line);
  if (!olMatch) return false;
  if (!state.inOl) {
    if (state.inUl) {
      out.push('</ul>');
      state.inUl = false;
    }
    state.inOl = true;
    out.push('<ol>');
  }
  out.push(`<li>${renderInline(olMatch[1].trim())}</li>`);
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
    const m = new RegExp(/^```\s*([a-zA-Z0-9_-]*)$/).exec(line);
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
